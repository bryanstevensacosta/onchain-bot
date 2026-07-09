import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoNewsLlmAdapter } from './crypto-news-llm.adapter';
import type { LlmPort } from 'shared/llm';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { PromptTemplateRepository } from 'telegram/crypto-news-publisher/application/ports/prompt-template.repository';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';

const TEMPLATE_PROMPT =
  'Title:{{title}}\nOriginal:{{original}}\nImage:{{hasImage}}\n';

// Constants for templating/return-time checks
const DEFAULT_TEMPLATE_ID = '00000000-0000-4000-8000-000000000001';
const OVERRIDE_TEMPLATE_ID = '00000000-0000-4000-8000-000000000002';

const buildEntry = (overrides: {
  rawTitle?: string | null;
  rawContent?: string;
  imagePath?: string | null;
  keywordTemplateId?: string | null;
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
    keywordTemplateId:
      overrides.keywordTemplateId === undefined
        ? null
        : overrides.keywordTemplateId,
  });
};

const buildTemplate = (
  id: string,
  overrides: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'max' | null;
    promptText?: string;
    systemPromptText?: string;
  } = {},
): PromptTemplate =>
  PromptTemplate.create({
    id,
    name: `tpl-${id.slice(-4)}`,
    model: overrides.model ?? 'gpt-test',
    maxTokens: overrides.maxTokens ?? 1234,
    temperature: overrides.temperature ?? 0.42,
    reasoningEffort: overrides.reasoningEffort ?? null,
    promptText: overrides.promptText ?? TEMPLATE_PROMPT,
    systemPromptText: overrides.systemPromptText ?? '',
  });

const buildLlmConfig = (defaultTemplateId: string): LlmConfig =>
  LlmConfig.load({
    defaultTemplateId,
    dailyCap: 1,
    dailyResetUtcHour: 0,
    randomDelayMinMs: 0,
    randomDelayMaxMs: 1,
    llmMaxAttempts: 1,
  });

describe('CryptoNewsLlmAdapter', () => {
  let llmPort: jest.Mocked<LlmPort>;
  let templateRepo: jest.Mocked<PromptTemplateRepository>;
  let llmConfigRepo: jest.Mocked<LlmConfigRepository>;
  let adapter: CryptoNewsLlmAdapter;
  let tempDir: string;

  beforeEach(() => {
    llmPort = {
      generateText: jest.fn(),
      isAvailable: jest.fn(),
    };
    llmPort.generateText.mockResolvedValue('refined text');
    templateRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    llmConfigRepo = {
      load: jest.fn(),
      save: jest.fn(),
    };
    adapter = new CryptoNewsLlmAdapter(llmPort, templateRepo, llmConfigRepo);
    tempDir = mkdtempSync(join(tmpdir(), 'crypto-news-llm-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('renderPromptFor', () => {
    it('substitutes title, original, hasImage=yes when imagePath present', () => {
      const entry = buildEntry({
        rawTitle: 'BTC $100k',
        rawContent: 'Bitcoin news',
        imagePath: '/tmp/foo.png',
      });
      const prompt = adapter.renderPromptFor(TEMPLATE_PROMPT, entry);
      expect(prompt).toBe('Title:BTC $100k\nOriginal:Bitcoin news\nImage:sí\n');
    });

    it('substitutes hasImage=no when imagePath is null', () => {
      const entry = buildEntry({
        rawTitle: 'BTC $100k',
        rawContent: 'Bitcoin news',
        imagePath: null,
      });
      const prompt = adapter.renderPromptFor(TEMPLATE_PROMPT, entry);
      expect(prompt).toBe('Title:BTC $100k\nOriginal:Bitcoin news\nImage:no\n');
    });

    it('substitutes an empty title when rawTitle is null', () => {
      const entry = buildEntry({ rawTitle: null, imagePath: null });
      const prompt = adapter.renderPromptFor(TEMPLATE_PROMPT, entry);
      expect(prompt).toContain('Title:\n');
    });
  });

  describe('generateForEntry', () => {
    it('returns the LLM text when the entry has no image and uses cfg.defaultTemplateId', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID, {
        model: 'gateway-default-model',
        maxTokens: 999,
      });
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockImplementation(async (id) =>
        id === DEFAULT_TEMPLATE_ID ? defaultTemplate : null,
      );

      const entry = buildEntry({ imagePath: null });
      const result = await adapter.generateForEntry(entry);
      expect(result).toBe('refined text');
      expect(llmConfigRepo.load).toHaveBeenCalledTimes(1);
      expect(templateRepo.findById).toHaveBeenCalledWith(DEFAULT_TEMPLATE_ID);
      expect(llmPort.generateText).toHaveBeenCalledTimes(1);
      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.model).toBe('gateway-default-model');
      expect(req.maxTokens).toBe(999);
      expect(req.temperature).toBe(0.42);
      expect(req.imageBase64).toBeUndefined();
      expect(req.mimeType).toBeUndefined();
      expect(req.prompt).toContain('BTC $100k');
      expect(req.prompt).toContain('no');
    });

    it('uses entry.keywordTemplateId when set, ignoring cfg.defaultTemplateId', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID, {
        model: 'default-model',
      });
      const overrideTemplate = buildTemplate(OVERRIDE_TEMPLATE_ID, {
        model: 'override-model',
        maxTokens: 4242,
        temperature: 0.1,
      });
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockImplementation(async (id) => {
        if (id === DEFAULT_TEMPLATE_ID) return defaultTemplate;
        if (id === OVERRIDE_TEMPLATE_ID) return overrideTemplate;
        return null;
      });

      const entry = buildEntry({
        keywordTemplateId: OVERRIDE_TEMPLATE_ID,
        imagePath: null,
      });
      await adapter.generateForEntry(entry);

      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.model).toBe('override-model');
      expect(req.maxTokens).toBe(4242);
      expect(req.temperature).toBe(0.1);
    });

    it('throws with a clear error when the resolved template does not exist', async () => {
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(null);

      const entry = buildEntry({ imagePath: null });
      await expect(adapter.generateForEntry(entry)).rejects.toThrow(
        `PromptTemplate not found: ${DEFAULT_TEMPLATE_ID}`,
      );
      expect(llmPort.generateText).not.toHaveBeenCalled();
    });

    it('throws with the keyword-bound id when an override template is missing', async () => {
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(null);

      const entry = buildEntry({
        keywordTemplateId: OVERRIDE_TEMPLATE_ID,
        imagePath: null,
      });
      await expect(adapter.generateForEntry(entry)).rejects.toThrow(
        `PromptTemplate not found: ${OVERRIDE_TEMPLATE_ID}`,
      );
    });

    it('forwards reasoningEffort to the LLM port when set on the template', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID, {
        reasoningEffort: 'high',
      });
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: null });
      await adapter.generateForEntry(entry);

      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.reasoningEffort).toBe('high');
    });

    it('omits reasoningEffort when the template has none', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID, {
        reasoningEffort: null,
      });
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: null });
      await adapter.generateForEntry(entry);

      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.reasoningEffort).toBeUndefined();
    });

    it('base64-encodes the local image and passes it to the LLM', async () => {
      const imagePath = join(tempDir, 'photo.png');
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
      ]);
      writeFileSync(imagePath, pngBytes);

      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath });
      await adapter.generateForEntry(entry);
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
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

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
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: '/nonexistent/photo.png' });
      await adapter.generateForEntry(entry);
      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.imageBase64).toBeUndefined();
      expect(req.mimeType).toBeUndefined();
    });

    it('propagates LLM errors', async () => {
      llmPort.generateText.mockRejectedValueOnce(new Error('openai down'));
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: null });
      await expect(adapter.generateForEntry(entry)).rejects.toThrow(
        'openai down',
      );
    });

    it('forwards template.systemPromptText as systemPrompt when present', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID, {
        systemPromptText: 'You are a crypto journalist.',
      });
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: null });
      await adapter.generateForEntry(entry);

      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.systemPrompt).toBe('You are a crypto journalist.');
    });

    it('omits systemPrompt when the template has no system prompt', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID);
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: null });
      await adapter.generateForEntry(entry);

      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.systemPrompt).toBeUndefined();
    });

    it('trims surrounding whitespace from the system prompt', async () => {
      const defaultTemplate = buildTemplate(DEFAULT_TEMPLATE_ID, {
        systemPromptText: '   You are an analyst.   ',
      });
      llmConfigRepo.load.mockResolvedValue(buildLlmConfig(DEFAULT_TEMPLATE_ID));
      templateRepo.findById.mockResolvedValue(defaultTemplate);

      const entry = buildEntry({ imagePath: null });
      await adapter.generateForEntry(entry);

      const req = llmPort.generateText.mock.calls[0][0];
      expect(req.systemPrompt).toBe('You are an analyst.');
    });
  });
});
