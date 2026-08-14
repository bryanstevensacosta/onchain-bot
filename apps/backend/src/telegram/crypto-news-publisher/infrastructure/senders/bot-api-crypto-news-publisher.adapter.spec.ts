import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { BotApiCryptoNewsPublisherAdapter } from './bot-api-crypto-news-publisher.adapter';

// Mock node:https so the configured path (sendMessage/sendPhoto/sendVideo)
// runs without touching the network. The adapter + BotApiHttpClient both
// import `request as httpsRequest` from 'node:https', so the partial-module
// mock intercepts every call. jest.mock is hoisted above imports.
jest.mock('node:https', () => {
  const actual = jest.requireActual('node:https') as unknown as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    request: jest.fn(),
  };
});

import { request as httpsRequest } from 'node:https';

const mockedRequest = httpsRequest as jest.MockedFunction<typeof httpsRequest>;

function makeConfigWith(
  botToken: string,
  outputChannel: string,
): ConfigService {
  return {
    get: () => ({
      publishing: { cryptoNews: { botToken, outputChannel } },
    }),
  } as unknown as ConfigService;
}

interface FakeReq {
  on: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
}

function createFakeReq(): FakeReq {
  return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
}

function createFakeResponse(body: string): EventEmitter {
  const res = new EventEmitter();
  setTimeout(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  }, 0);
  return res;
}

function mockSuccessResponse(messageId: number): void {
  mockedRequest.mockImplementation(
    (
      _url: string | URL,
      _options: unknown,
      cb: (res: EventEmitter) => void,
    ) => {
      const res = createFakeResponse(
        JSON.stringify({ ok: true, result: { message_id: messageId } }),
      );
      cb(res);
      return createFakeReq() as never;
    },
  );
}

function lastRequestBody(): string {
  const req = mockedRequest.mock.results.at(-1)?.value as FakeReq;
  const writeCall = req.write.mock.calls.at(-1);
  return writeCall ? String(writeCall[0]) : '';
}

describe('BotApiCryptoNewsPublisherAdapter — graceful not-configured path', () => {
  it('does NOT throw at construction when both env vars are missing', () => {
    expect(
      () => new BotApiCryptoNewsPublisherAdapter(makeConfigWith('', '')),
    ).not.toThrow();
  });

  it('returns ok=false with not-configured error from sendMessage', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('', ''),
    );
    const result = await adapter.sendMessage('anyChat', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
  });

  it('returns ok=false with not-configured error from sendPhoto', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('', ''),
    );
    const result = await adapter.sendPhoto(
      'anyChat',
      'caption',
      '/tmp/some.jpg',
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
  });

  it('reports only the missing channel in the error when token is set', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('TEST_TOKEN', ''),
    );
    const result = await adapter.sendMessage('anyChat', 'hello');
    expect(result.error).toContain('CRYPTO_NEWS_OUTPUT_CHANNEL');
    expect(result.error).not.toContain('CRYPTO_NEWS_BOT_TOKEN');
  });

  it('reports only the missing token in the error when channel is set', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('', '@test'),
    );
    const result = await adapter.sendMessage('anyChat', 'hello');
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
    expect(result.error).not.toContain('CRYPTO_NEWS_OUTPUT_CHANNEL');
  });
});

describe('BotApiCryptoNewsPublisherAdapter — configured path (https mocked)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  describe('parse mode: Markdown (default)', () => {
    it('applies formatUrlsAsMarkdown and sends parse_mode Markdown by default', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      const result = await adapter.sendMessage('ignored', 'See https://x.io');

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe(42);
      const payload = JSON.parse(lastRequestBody()) as {
        chat_id: string;
        text: string;
        parse_mode: string;
      };
      expect(payload.chat_id).toBe('@channel');
      expect(payload.text).toBe('See [https://x.io](https://x.io)');
      expect(payload.parse_mode).toBe('Markdown');
    });

    it('keeps existing markdown links untouched (formatUrlsAsMarkdown)', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', '[label](https://x.io)');

      const payload = JSON.parse(lastRequestBody()) as { text: string };
      expect(payload.text).toBe('[label](https://x.io)');
    });
  });

  describe('parse mode: HTML', () => {
    it('applies the sanitizer (raw URL → <a href>) and sends parse_mode HTML', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', 'See https://x.io', undefined, {
        parseMode: 'HTML',
      });

      const payload = JSON.parse(lastRequestBody()) as {
        text: string;
        parse_mode: string;
      };
      expect(payload.parse_mode).toBe('HTML');
      expect(payload.text).toBe('See <a href="https://x.io">https://x.io</a>');
    });

    it('does NOT convert markdown links when parse mode is HTML', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', '[label](https://x.io)', undefined, {
        parseMode: 'HTML',
      });

      const payload = JSON.parse(lastRequestBody()) as { text: string };
      // The sanitizer keeps the label text but wraps the URL in <a href>
      // instead of leaving a markdown link.
      expect(payload.text).not.toContain('](https://x.io)');
      expect(payload.text).toContain('<a href="https://x.io">');
    });
  });

  describe('length limits', () => {
    it('truncates sendMessage text over 4096 chars with a trailing ellipsis', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      const longText = 'x'.repeat(5000);
      await adapter.sendMessage('ignored', longText, undefined, {
        parseMode: 'HTML',
      });

      const payload = JSON.parse(lastRequestBody()) as { text: string };
      expect(payload.text.length).toBe(4096);
      expect(payload.text.endsWith('…')).toBe(true);
    });

    it('truncates sendPhoto caption over 1024 chars with a trailing ellipsis', async () => {
      mockSuccessResponse(42);
      const uploadsRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'ads-adapter-'),
      );
      const imagePath = path.join(uploadsRoot, 'hero.png');
      await fs.writeFile(imagePath, Buffer.from('png-bytes'));
      try {
        const adapter = new BotApiCryptoNewsPublisherAdapter(
          makeConfigWith('TOKEN', '@channel'),
        );
        const longCaption = 'y'.repeat(2000);
        const result = await adapter.sendPhoto(
          'ignored',
          longCaption,
          imagePath,
          { parseMode: 'HTML' },
        );

        expect(result.ok).toBe(true);
        const body = lastRequestBody();
        // multipart body contains the truncated caption
        const captionMatch = body.match(/name="caption"\r\n\r\n([\s\S]*?)\r\n/);
        expect(captionMatch).not.toBeNull();
        const caption = captionMatch![1];
        expect(caption.length).toBe(1024);
        expect(caption.endsWith('…')).toBe(true);
      } finally {
        await fs.rm(uploadsRoot, { recursive: true, force: true });
      }
    });
  });
});
