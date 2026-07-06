import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoNewsLlmAdapter } from './crypto-news-llm.adapter';
import type { LlmPort } from 'shared/llm';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

describe('CryptoNewsLlmAdapter', () => {
  let llmPort: jest.Mocked<LlmPort>;
  let adapter: CryptoNewsLlmAdapter;
  let tempDir: string;

  const buildEntry = (overrides: {
    rawTitle?: string | null;
    rawContent?: string;
    imagePath?: string | null;
  }): PublisherQueueEntry => {
    return PublisherQueueEntry.create({
      channelId: 'crypto-news',
      messageId: 1,
      rawContent: overrides.rawContent ?? 'Bitcoin hits $100k today',
      rawTitle:
        overrides.rawTitle === undefined ? 'BTC $100k' : overrides.rawTitle,
      imagePath: overrides.imagePath === undefined ? null : overrides.imagePath,
      groupedId: null,
      messageReceivedAt: new Date('2026-07-06T12:00:00Z'),
    });
  };

  beforeEach(() => {
    llmPort = {
      generateText: jest.fn(),
      isAvailable: jest.fn(),
    };
    llmPort.generateText.mockResolvedValue('refined text');
    adapter = new CryptoNewsLlmAdapter(llmPort);
    tempDir = mkdtempSync(join(tmpdir(), 'crypto-news-llm-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('buildPrompt', () => {
    it('substitutes title, content, and hasImage=yes when imagePath present', () => {
      const entry = buildEntry({
        rawTitle: 'BTC $100k',
        rawContent: 'Bitcoin news',
        imagePath: '/tmp/foo.png',
      });
      const prompt = adapter.buildPrompt(entry);
      expect(prompt).toContain('BTC $100k');
      expect(prompt).toContain('Bitcoin news');
      expect(prompt).toContain('sí');
      expect(prompt).not.toContain('{{title}}');
      expect(prompt).not.toContain('{{original}}');
      expect(prompt).not.toContain('{{hasImage}}');
    });

    it('substitutes hasImage=no when imagePath is null', () => {
      const entry = buildEntry({
        rawTitle: 'BTC $100k',
        rawContent: 'Bitcoin news',
        imagePath: null,
      });
      const prompt = adapter.buildPrompt(entry);
      expect(prompt).toContain('no');
      expect(prompt).not.toContain('{{hasImage}}');
    });

    it('falls back to a placeholder when rawTitle is null', () => {
      const entry = buildEntry({ rawTitle: null, imagePath: null });
      const prompt = adapter.buildPrompt(entry);
      expect(prompt).toContain('(sin título)');
    });
  });

  describe('generateForEntry', () => {
    it('returns the LLM text when the entry has no image', async () => {
      const entry = buildEntry({ imagePath: null });
      const result = await adapter.generateForEntry(entry);
      expect(result).toBe('refined text');
      expect(llmPort.generateText).toHaveBeenCalledTimes(1);
      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.prompt).toContain('BTC $100k');
      expect(req.imageBase64).toBeUndefined();
      expect(req.mimeType).toBeUndefined();
    });

    it('base64-encodes the local image and passes it to the LLM', async () => {
      const imagePath = join(tempDir, 'photo.png');
      // PNG magic header so the file is a real (but tiny) image.
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
      ]);
      writeFileSync(imagePath, pngBytes);

      const entry = buildEntry({ imagePath });
      const result = await adapter.generateForEntry(entry);
      expect(result).toBe('refined text');
      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.imageBase64).toBe(pngBytes.toString('base64'));
      expect(req.mimeType).toBe('image/png');
    });

    it('infers the correct MIME for jpg/jpeg/webp/gif', async () => {
      const cases: Array<[string, string]> = [
        ['photo.jpg', 'image/jpeg'],
        ['photo.jpeg', 'image/jpeg'],
        ['photo.gif', 'image/gif'],
        ['photo.webp', 'image/webp'],
        ['photo.unknown', 'image/jpeg'],
      ];
      for (const [name, mime] of cases) {
        const imagePath = join(tempDir, name);
        writeFileSync(imagePath, Buffer.from([0x00, 0x01, 0x02]));
        llmPort.generateText.mockClear();
        const entry = buildEntry({ imagePath });
        await adapter.generateForEntry(entry);
        const req = llmPort.generateText.mock.calls[0][0];
        expect(req.mimeType).toBe(mime);
        expect(req.imageBase64).toBeDefined();
      }
    });

    it('continues without the image when the file is unreadable', async () => {
      const entry = buildEntry({ imagePath: '/nonexistent/photo.png' });
      const result = await adapter.generateForEntry(entry);
      expect(result).toBe('refined text');
      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.imageBase64).toBeUndefined();
      expect(req.mimeType).toBeUndefined();
    });

    it('propagates LLM errors', async () => {
      llmPort.generateText.mockRejectedValueOnce(new Error('openai down'));
      const entry = buildEntry({ imagePath: null });
      await expect(adapter.generateForEntry(entry)).rejects.toThrow(
        'openai down',
      );
    });
  });
});
