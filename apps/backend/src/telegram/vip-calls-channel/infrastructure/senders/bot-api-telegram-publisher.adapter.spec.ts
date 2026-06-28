import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { VipCallsBotApiPublisherAdapter } from './bot-api-telegram-publisher.adapter';

interface FakeConfig {
  get<T>(key: string): T;
}

function makeConfig(
  overrides: Partial<{ botToken: string; outputChannel: string }> = {},
): FakeConfig {
  const cfg = {
    publishing: {
      vipCalls: {
        botToken: overrides.botToken ?? 'test-bot-token',
        outputChannel: overrides.outputChannel ?? '-1001234567890',
      },
    },
  };
  return {
    get: <T>(_key: string): T => cfg as unknown as T,
  };
}

interface MockHttp {
  post: jest.Mock;
}

function makeHttp(): MockHttp {
  return { post: jest.fn() };
}

describe('VipCallsBotApiPublisherAdapter', () => {
  describe('constructor', () => {
    it('reads botToken + outputChannel from app config', () => {
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        makeHttp() as unknown as HttpService,
      );
      expect(adapter.name).toBeUndefined();
    });

    it('throws when VIP_CALLS_BOT_TOKEN is missing', () => {
      expect(
        () =>
          new VipCallsBotApiPublisherAdapter(
            makeConfig({ botToken: '' }) as unknown as ConfigService,
            makeHttp() as unknown as HttpService,
          ),
      ).toThrow('VIP_CALLS_BOT_TOKEN not configured');
    });

    it('throws when VIP_CALLS_OUTPUT_CHANNEL is missing', () => {
      expect(
        () =>
          new VipCallsBotApiPublisherAdapter(
            makeConfig({ outputChannel: '' }) as unknown as ConfigService,
            makeHttp() as unknown as HttpService,
          ),
      ).toThrow('VIP_CALLS_OUTPUT_CHANNEL not configured');
    });
  });

  describe('sendMessage — text only', () => {
    it('returns error result when text is empty', async () => {
      const http = makeHttp();
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const result = await adapter.sendMessage('ignored', '');

      expect(result.ok).toBe(false);
      expect(result.messageId).toBeNull();
      expect(result.error).toBe('empty message');
      expect(http.post).not.toHaveBeenCalled();
    });

    it('returns ok + messageId on single successful send', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 42 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const result = await adapter.sendMessage('ignored', 'hello world');

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe(42);
      expect(result.error).toBeNull();
    });

    it('uses configured outputChannel, ignoring the chatId argument', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig({
          outputChannel: '-1009999999999',
        }) as unknown as ConfigService,
        http as unknown as HttpService,
      );

      await adapter.sendMessage('DIFFERENT_CHANNEL', 'hi');

      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('sendMessage'),
        expect.objectContaining({ chat_id: '-1009999999999' }),
      );
    });

    it('sends parse_mode=Markdown + disable_web_page_preview', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      await adapter.sendMessage('ignored', '**bold** text');

      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      );
    });

    it('includes the bot token in the URL path', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig({ botToken: 'MY-SECRET-TOKEN' }) as unknown as ConfigService,
        http as unknown as HttpService,
      );

      await adapter.sendMessage('ignored', 'x');

      expect(http.post).toHaveBeenCalledWith(
        'https://api.telegram.org/botMY-SECRET-TOKEN/sendMessage',
        expect.any(Object),
      );
    });

    it('splits text > 4096 chars into multiple chunks and sends each', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 2 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const longText = 'a'.repeat(5000);
      const result = await adapter.sendMessage('ignored', longText);

      expect(http.post).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      expect(result.messageId).toBe(2);
    });

    it('returns error and stops sending when a chunk fails', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      http.post.mockReturnValueOnce(
        of({
          data: { ok: false, description: 'Bad Request: chat not found' },
        }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const result = await adapter.sendMessage('ignored', 'a'.repeat(5000));

      expect(result.ok).toBe(false);
      expect(result.messageId).toBeNull();
      expect(result.error).toContain('chat not found');
      expect(http.post).toHaveBeenCalledTimes(2);
    });

    it('returns error when Telegram API responds with ok=false', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({
          data: { ok: false, description: 'Too Many Requests: retry after 5' },
        }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const result = await adapter.sendMessage('ignored', 'x');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Too Many Requests');
    });

    it('returns error when HttpService throws', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        throwError(() => new Error('ECONNREFUSED')),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const result = await adapter.sendMessage('ignored', 'x');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('sendMessage — with image', () => {
    it('uses sendPhoto endpoint when imageUrl is provided', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 7 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      await adapter.sendMessage('ignored', 'caption text', 'https://x/y.png');

      expect(http.post).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest-bot-token/sendPhoto',
        expect.objectContaining({
          photo: 'https://x/y.png',
          caption: 'caption text',
        }),
      );
    });

    it('sends the full text as caption when ≤ 1024 chars', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      await adapter.sendMessage('ignored', 'short caption', 'https://x/y.png');

      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ caption: 'short caption' }),
      );
    });

    it('truncates caption with ellipsis when text > 1024 chars', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const longText = 'a'.repeat(2000);
      await adapter.sendMessage('ignored', longText, 'https://x/y.png');

      const firstCall = http.post.mock.calls[0];
      const caption = firstCall[1].caption as string;
      expect(caption.length).toBeLessThanOrEqual(1024);
      expect(caption.endsWith('…')).toBe(true);
    });

    it('sends photo + remaining text chunks when caption was truncated', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 1 } } }),
      );
      http.post.mockReturnValueOnce(
        of({ data: { ok: true, result: { message_id: 2 } } }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const longText = 'a'.repeat(5000);
      const result = await adapter.sendMessage(
        'ignored',
        longText,
        'https://x/y.png',
      );

      expect(http.post).toHaveBeenCalledTimes(2);
      expect(http.post.mock.calls[0][0]).toContain('sendPhoto');
      expect(http.post.mock.calls[1][0]).toContain('sendMessage');
      expect(result.ok).toBe(true);
      expect(result.messageId).toBe(2);
    });

    it('returns error when sendPhoto fails', async () => {
      const http = makeHttp();
      http.post.mockReturnValueOnce(
        of({
          data: { ok: false, description: 'Bad Request: invalid photo URL' },
        }),
      );
      const adapter = new VipCallsBotApiPublisherAdapter(
        makeConfig() as unknown as ConfigService,
        http as unknown as HttpService,
      );

      const result = await adapter.sendMessage(
        'ignored',
        'caption',
        'https://bad-url',
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain('invalid photo URL');
    });
  });
});
