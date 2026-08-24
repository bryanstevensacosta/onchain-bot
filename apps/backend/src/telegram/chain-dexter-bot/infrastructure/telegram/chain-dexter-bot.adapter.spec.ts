import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ChainDexterBotAdapter } from './chain-dexter-bot.adapter';
import {
  TokenScanService,
  TokenScanResult,
} from '../../application/token-scan.service';
import { MessageFormatterAdapter } from './message-formatter.adapter';
import type { TelegramUpdate, TelegramMessage } from './bot-client';

interface FakeConfig {
  get<T>(key: string): T;
}

function makeConfig(overrides: Partial<{ botToken: string }> = {}): FakeConfig {
  const cfg = {
    app: {
      publishing: {
        chainDexterBot: {
          botToken:
            overrides.botToken ??
            'test-bot-token-123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        },
      },
    },
  };
  return {
    get: <T>(key: string): T => {
      if (key === 'app') return cfg.app as unknown as T;
      return undefined as unknown as T;
    },
  };
}

interface MockHttp {
  post: jest.Mock<unknown, [string, Record<string, unknown>]>;
}

function makeHttp(): MockHttp {
  return { post: jest.fn<unknown, [string, Record<string, unknown>]>() };
}

interface MockTokenScanService {
  getTokenInfo: jest.Mock<Promise<TokenScanResult | null>, [string]>;
}

function makeTokenScanService(): MockTokenScanService {
  return { getTokenInfo: jest.fn<Promise<TokenScanResult | null>, [string]>() };
}

interface MockFormatter {
  format: jest.Mock<string, [TokenScanResult]>;
  formatTokenScan: jest.Mock<
    { text: string; truncated: boolean },
    [TokenScanResult, { compact?: boolean }?]
  >;
}

function makeFormatter(): MockFormatter {
  return {
    format: jest
      .fn<string, [TokenScanResult]>()
      .mockReturnValue('formatted message'),
    formatTokenScan: jest
      .fn<
        { text: string; truncated: boolean },
        [TokenScanResult, { compact?: boolean }?]
      >()
      .mockReturnValue({ text: 'formatted message', truncated: false }),
  };
}

function makeUpdate(
  messageText: string,
  type:
    | 'message'
    | 'edited_message'
    | 'channel_post'
    | 'edited_channel_post' = 'message',
): TelegramUpdate {
  const isChannel = type === 'channel_post' || type === 'edited_channel_post';
  const baseMessage: TelegramMessage = {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 123456789, type: isChannel ? 'channel' : 'group' },
    text: messageText,
  };

  return {
    update_id: 1,
    [type]: baseMessage,
  };
}

function makeTokenScanResult(
  overrides: Partial<TokenScanResult> = {},
): TokenScanResult {
  return {
    symbol: 'TEST',
    name: 'Test Token',
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    priceUsd: 1.5,
    priceChange24h: 5.2,
    marketCapUsd: 1500000,
    fdvUsd: 2000000,
    liquidityUsd: 500000,
    liquidityLockedPercent: 80,
    liquidityBurnedPercent: 10,
    volume24hUsd: 300000,
    athUsd: 2000000,
    athPercentChange: -25,
    athDaysAgo: 30,
    holders: 1234,
    top10HolderPercent: 15.5,
    top20HolderPercent: 25.3,
    ...overrides,
  };
}

describe('ChainDexterBotAdapter', () => {
  describe('constructor', () => {
    it('reads botToken from app config', () => {
      const adapter = new ChainDexterBotAdapter(
        makeConfig() as unknown as ConfigService,
        makeHttp() as unknown as HttpService,
        makeTokenScanService() as unknown as TokenScanService,
        makeFormatter() as unknown as MessageFormatterAdapter,
      );
      expect(adapter).toBeDefined();
    });

    it('handles missing botToken gracefully (warns but does not throw)', () => {
      const consoleWarn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const adapter = new ChainDexterBotAdapter(
        makeConfig({ botToken: '' }) as unknown as ConfigService,
        makeHttp() as unknown as HttpService,
        makeTokenScanService() as unknown as TokenScanService,
        makeFormatter() as unknown as MessageFormatterAdapter,
      );
      expect(adapter).toBeDefined();
      consoleWarn.mockRestore();
    });
  });

  describe('handleUpdate — plain CA message flow', () => {
    let http: MockHttp;
    let tokenScan: MockTokenScanService;
    let formatter: MockFormatter;
    let adapter: ChainDexterBotAdapter;

    beforeEach(() => {
      http = makeHttp();
      tokenScan = makeTokenScanService();
      formatter = makeFormatter();
      http.post.mockReturnValue(
        of({ data: { ok: true, result: { message_id: 42 } } }),
      );
      tokenScan.getTokenInfo.mockResolvedValue(makeTokenScanResult());

      adapter = new ChainDexterBotAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
        tokenScan as unknown as TokenScanService,
        formatter as unknown as MessageFormatterAdapter,
      );
    });

    it('1. Message containing valid CA → calls TokenScanService.getTokenInfo, sends formatted reply', async () => {
      const ca = 'So11111111111111111111111111111111111111112';
      const update = makeUpdate(`Check this token: ${ca}`);

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).toHaveBeenCalledWith(ca);
      expect(formatter.format).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'TEST', address: ca }),
      );
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('sendMessage'),
        expect.objectContaining({
          chat_id: 123456789,
          text: 'formatted message',
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      );
    });

    it('2. Message without CA → no reply', async () => {
      const update = makeUpdate('Hello world, no contract address here!');

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).not.toHaveBeenCalled();
      expect(formatter.format).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    });

    it('3. Message with multiple CAs → replies for each', async () => {
      const ca1 = 'So11111111111111111111111111111111111111112';
      const ca2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const update = makeUpdate(`Two tokens: ${ca1} and ${ca2}`);

      tokenScan.getTokenInfo
        .mockResolvedValueOnce(
          makeTokenScanResult({ address: ca1, symbol: 'TOKEN1' }),
        )
        .mockResolvedValueOnce(
          makeTokenScanResult({ address: ca2, symbol: 'TOKEN2' }),
        );

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).toHaveBeenCalledTimes(2);
      expect(tokenScan.getTokenInfo).toHaveBeenNthCalledWith(1, ca1);
      expect(tokenScan.getTokenInfo).toHaveBeenNthCalledWith(2, ca2);
      expect(formatter.format).toHaveBeenCalledTimes(2);
      expect(http.post).toHaveBeenCalledTimes(2);
    });

    it('4. TokenScanService returns null → sends "No data found"', async () => {
      const ca = 'So11111111111111111111111111111111111111112';
      const update = makeUpdate(`Check this: ${ca}`);
      tokenScan.getTokenInfo.mockResolvedValueOnce(null);

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).toHaveBeenCalledWith(ca);
      expect(formatter.format).not.toHaveBeenCalled();
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('sendMessage'),
        expect.objectContaining({
          chat_id: 123456789,
          text: expect.stringContaining('No data found'),
        }),
      );
    });

    it('5. Edited message with valid CA → processes and replies', async () => {
      const ca = 'So11111111111111111111111111111111111111112';
      const update = makeUpdate(`Edited: ${ca}`, 'edited_message');

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).toHaveBeenCalledWith(ca);
      expect(formatter.format).toHaveBeenCalled();
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('sendMessage'),
        expect.objectContaining({
          chat_id: 123456789,
          text: 'formatted message',
        }),
      );
    });

    it('6. Multiple CAs in single message → processes each', async () => {
      const ca1 = 'So11111111111111111111111111111111111111112';
      const ca2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const update = makeUpdate(`Two tokens: ${ca1} and ${ca2}`);
      tokenScan.getTokenInfo
        .mockResolvedValueOnce(
          makeTokenScanResult({ address: ca1, symbol: 'TOKEN1' }),
        )
        .mockResolvedValueOnce(
          makeTokenScanResult({ address: ca2, symbol: 'TOKEN2' }),
        );

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).toHaveBeenCalledTimes(2);
      expect(tokenScan.getTokenInfo).toHaveBeenNthCalledWith(1, ca1);
      expect(tokenScan.getTokenInfo).toHaveBeenNthCalledWith(2, ca2);
      expect(formatter.format).toHaveBeenCalledTimes(2);
      expect(http.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleUpdate — edge cases', () => {
    let http: MockHttp;
    let tokenScan: MockTokenScanService;
    let formatter: MockFormatter;
    let adapter: ChainDexterBotAdapter;

    beforeEach(() => {
      http = makeHttp();
      tokenScan = makeTokenScanService();
      formatter = makeFormatter();
      http.post.mockReturnValue(
        of({ data: { ok: true, result: { message_id: 42 } } }),
      );
      tokenScan.getTokenInfo.mockResolvedValue(makeTokenScanResult());

      adapter = new ChainDexterBotAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
        tokenScan as unknown as TokenScanService,
        formatter as unknown as MessageFormatterAdapter,
      );
    });

    it('ignores update with no message, edited_message, channel_post, or edited_channel_post', async () => {
      const update: TelegramUpdate = {
        update_id: 1,
        callback_query: {
          id: '1',
          from: { id: 1, is_bot: false, first_name: 'test' },
          chat_instance: '1',
        },
      };

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    });

    it('ignores message with no text', async () => {
      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 123456789, type: 'group' },
        },
      };

      await adapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    });

    it('returns early when bot token is not configured', async () => {
      const consoleWarn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const noTokenAdapter = new ChainDexterBotAdapter(
        makeConfig({ botToken: '' }) as unknown as ConfigService,
        http as unknown as HttpService,
        tokenScan as unknown as TokenScanService,
        formatter as unknown as MessageFormatterAdapter,
      );

      const ca = 'So11111111111111111111111111111111111111112';
      const update = makeUpdate(`Check: ${ca}`);

      await noTokenAdapter.handleUpdate(update);

      expect(tokenScan.getTokenInfo).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
      consoleWarn.mockRestore();
    });
  });

  describe('sendMessage', () => {
    let http: MockHttp;
    let tokenScan: MockTokenScanService;
    let formatter: MockFormatter;
    let adapter: ChainDexterBotAdapter;

    beforeEach(() => {
      http = makeHttp();
      tokenScan = makeTokenScanService();
      formatter = makeFormatter();

      adapter = new ChainDexterBotAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
        tokenScan as unknown as TokenScanService,
        formatter as unknown as MessageFormatterAdapter,
      );
    });

    it('returns error when bot not configured', async () => {
      const noTokenAdapter = new ChainDexterBotAdapter(
        makeConfig({ botToken: '' }) as unknown as ConfigService,
        http as unknown as HttpService,
        tokenScan as unknown as TokenScanService,
        formatter as unknown as MessageFormatterAdapter,
      );

      const result = await noTokenAdapter.sendMessage(123, 'test');

      expect(result.ok).toBe(false);
      expect(result.messageId).toBeNull();
      expect(result.error).toBe('Bot not configured');
      expect(http.post).not.toHaveBeenCalled();
    });

    it('returns ok + messageId on successful send', async () => {
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 99 } } }),
      );

      const result = await adapter.sendMessage(123456789, 'hello');

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe(99);
      expect(result.error).toBeNull();
      expect(http.post).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token-123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ/sendMessage',
        expect.objectContaining({
          chat_id: 123456789,
          text: 'hello',
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      );
    });

    it('returns error when Telegram API responds with ok=false', async () => {
      http.post.mockReturnValueOnce(
        of({ data: { ok: false, description: 'Bad Request: chat not found' } }),
      );

      const result = await adapter.sendMessage(123456789, 'test');

      expect(result.ok).toBe(false);
      expect(result.messageId).toBeNull();
      expect(result.error).toContain('chat not found');
    });

    it('returns error when HttpService throws', async () => {
      http.post.mockReturnValueOnce(
        throwError(() => new Error('ECONNREFUSED')),
      );

      const result = await adapter.sendMessage(123456789, 'test');

      expect(result.ok).toBe(false);
      expect(result.messageId).toBeNull();
      expect(result.error).toContain('ECONNREFUSED');
    });
  });
});
