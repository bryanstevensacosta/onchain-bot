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

function requestBodyAt(index: number): string {
  const req = mockedRequest.mock.results[index]?.value as FakeReq;
  const writeCall = req.write.mock.calls.at(-1);
  return writeCall ? String(writeCall[0]) : '';
}

function requestUrlAt(index: number): string {
  const call = mockedRequest.mock.calls[index];
  return call ? String(call[0]) : '';
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

  describe('inline keyboard (reply_markup)', () => {
    it('adds reply_markup inline_keyboard to the sendMessage JSON payload', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', 'Join us', undefined, {
        parseMode: 'HTML',
        replyMarkup: [[{ text: 'Abrir', url: 'https://ourbit.com/ref' }]],
      });

      const payload = JSON.parse(lastRequestBody()) as {
        reply_markup: {
          inline_keyboard: Array<Array<{ text: string; url: string }>>;
        };
      };
      expect(payload.reply_markup).toEqual({
        inline_keyboard: [[{ text: 'Abrir', url: 'https://ourbit.com/ref' }]],
      });
    });

    it('omits reply_markup when no keyboard is passed', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', 'Join us');

      const payload = JSON.parse(lastRequestBody()) as Record<string, unknown>;
      expect(payload.reply_markup).toBeUndefined();
    });

    it('adds reply_markup as a multipart text field on sendPhoto', async () => {
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
        await adapter.sendPhoto('ignored', 'caption', imagePath, {
          parseMode: 'HTML',
          replyMarkup: [[{ text: 'Abrir', url: 'https://ourbit.com/ref' }]],
        });

        const body = lastRequestBody();
        const markupMatch = body.match(
          /name="reply_markup"\r\n\r\n([\s\S]*?)\r\n/,
        );
        expect(markupMatch).not.toBeNull();
        expect(JSON.parse(markupMatch![1])).toEqual({
          inline_keyboard: [[{ text: 'Abrir', url: 'https://ourbit.com/ref' }]],
        });
      } finally {
        await fs.rm(uploadsRoot, { recursive: true, force: true });
      }
    });
  });

  describe('length limits', () => {
    it('sends text over 4096 chars as primary + continuation (no content lost)', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      const longText = 'x'.repeat(5000);
      const result = await adapter.sendMessage('ignored', longText, undefined, {
        parseMode: 'HTML',
      });

      expect(result.ok).toBe(true);
      expect(mockedRequest).toHaveBeenCalledTimes(2);
      const primary = JSON.parse(requestBodyAt(0)) as { text: string };
      expect(primary.text.length).toBe(4096);
      expect(primary.text.endsWith('…')).toBe(true);
      const followUp = JSON.parse(requestBodyAt(1)) as { text: string };
      expect(followUp.text).toBe('x'.repeat(905));
      expect(followUp.text.endsWith('…')).toBe(false);
    });

    it('threads the continuation as a reply to the primary message', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', 'x'.repeat(5000), undefined, {
        parseMode: 'HTML',
      });

      const followUp = JSON.parse(requestBodyAt(1)) as {
        text: string;
        reply_to_message_id?: number;
      };
      expect(followUp.reply_to_message_id).toBe(42);
      const primary = JSON.parse(requestBodyAt(0)) as {
        reply_to_message_id?: number;
      };
      expect(primary.reply_to_message_id).toBeUndefined();
    });

    it('sends short text as a single request (no follow-up)', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', 'hello', undefined, {
        parseMode: 'HTML',
      });

      expect(mockedRequest).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(lastRequestBody()) as { text: string };
      expect(payload.text).toBe('hello');
    });

    it('sends photo caption remainder as a follow-up without reply markup', async () => {
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
          {
            parseMode: 'HTML',
            replyMarkup: [[{ text: 'Abrir', url: 'https://ourbit.com/ref' }]],
          },
        );

        expect(result.ok).toBe(true);
        expect(mockedRequest).toHaveBeenCalledTimes(2);
        // Primary: multipart photo with truncated caption (+ markup kept).
        const photoBody = requestBodyAt(0);
        const captionMatch = photoBody.match(
          /name="caption"\r\n\r\n([\s\S]*?)\r\n/,
        );
        expect(captionMatch).not.toBeNull();
        const caption = captionMatch![1];
        expect(caption.length).toBe(1024);
        expect(caption.endsWith('…')).toBe(true);
        expect(photoBody).toContain('reply_markup');
        // Follow-up: plain JSON with the remainder, no buttons.
        expect(requestUrlAt(1)).toContain('sendMessage');
        const followUp = JSON.parse(requestBodyAt(1)) as {
          text: string;
          reply_markup?: unknown;
          reply_to_message_id?: number;
        };
        expect(followUp.text).toBe('y'.repeat(2000 - 1023));
        expect(followUp.reply_markup).toBeUndefined();
        expect(followUp.reply_to_message_id).toBe(42);
      } finally {
        await fs.rm(uploadsRoot, { recursive: true, force: true });
      }
    });

    it('splits long captions at paragraph boundaries when possible', async () => {
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
        const longCaption = `lead paragraph\n\n${'b'.repeat(1500)}`;
        await adapter.sendPhoto('ignored', longCaption, imagePath, {
          parseMode: 'HTML',
        });

        const photoBody = requestBodyAt(0);
        const captionMatch = photoBody.match(
          /name="caption"\r\n\r\n([\s\S]*?)\r\n/,
        );
        expect(captionMatch![1]).toBe('lead paragraph…');
        const followUp = JSON.parse(requestBodyAt(1)) as { text: string };
        expect(followUp.text).toBe('b'.repeat(1500));
      } finally {
        await fs.rm(uploadsRoot, { recursive: true, force: true });
      }
    });

    it('returns primary ok=true when the follow-up fails (no duplicate retry)', async () => {
      const uploadsRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'ads-adapter-'),
      );
      const imagePath = path.join(uploadsRoot, 'hero.png');
      await fs.writeFile(imagePath, Buffer.from('png-bytes'));
      try {
        let calls = 0;
        mockedRequest.mockImplementation(
          (
            _url: string | URL,
            _options: unknown,
            cb: (res: EventEmitter) => void,
          ) => {
            calls += 1;
            const body =
              calls === 1
                ? JSON.stringify({ ok: true, result: { message_id: 42 } })
                : JSON.stringify({ ok: false, description: 'flood' });
            cb(createFakeResponse(body));
            return createFakeReq() as never;
          },
        );
        const adapter = new BotApiCryptoNewsPublisherAdapter(
          makeConfigWith('TOKEN', '@channel'),
        );
        const result = await adapter.sendPhoto(
          'ignored',
          'z'.repeat(2000),
          imagePath,
          { parseMode: 'HTML' },
        );

        expect(result.ok).toBe(true);
        expect(result.messageId).toBe(42);
        expect(mockedRequest).toHaveBeenCalledTimes(2);
      } finally {
        await fs.rm(uploadsRoot, { recursive: true, force: true });
      }
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
        const body = requestBodyAt(0);
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

    it('doubles single line breaks for readability', async () => {
      mockSuccessResponse(42);
      const adapter = new BotApiCryptoNewsPublisherAdapter(
        makeConfigWith('TOKEN', '@channel'),
      );
      await adapter.sendMessage('ignored', 'hola\ncomo estas', undefined, {
        parseMode: 'HTML',
      });

      expect(mockedRequest).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(lastRequestBody()) as { text: string };
      expect(payload.text).toBe('hola\n\ncomo estas');
    });

    it('never splits a bullet mid-sentence, single-spaced input', async () => {
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
        // Single-spaced bullets like the LLM emits; total over 1024.
        const text = `Title\n• ${'a'.repeat(600)}\n• ${'b'.repeat(600)}`;
        const result = await adapter.sendPhoto('ignored', text, imagePath, {
          parseMode: 'HTML',
        });

        expect(result.ok).toBe(true);
        expect(mockedRequest).toHaveBeenCalledTimes(2);
        const photoBody = requestBodyAt(0);
        const captionMatch = photoBody.match(
          /name="caption"\r\n\r\n([\s\S]*?)\r\n/,
        );
        const caption = captionMatch![1];
        // Whole bullet 1 present (plus breathing room), bullet 2 untouched.
        expect(caption).toContain('a'.repeat(600));
        expect(caption).not.toContain('b');
        expect(caption.endsWith('…')).toBe(true);
        expect(caption).not.toMatch(/\n…$/);
        const followUp = JSON.parse(requestBodyAt(1)) as { text: string };
        expect(followUp.text.startsWith('• ' + 'b')).toBe(true);
        expect(followUp.text).toContain('b'.repeat(600));
        expect(followUp.text).not.toContain('…');
      } finally {
        await fs.rm(uploadsRoot, { recursive: true, force: true });
      }
    });
  });
});
