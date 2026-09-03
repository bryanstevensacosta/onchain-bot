import { Test, TestingModule } from '@nestjs/testing';
import { LlmArbiterService } from '../llm-arbiter.service';
import { LlmModelProviderService } from '../llm-model-provider.service';
import { LlmPort } from 'shared/llm/llm.port';

describe('LlmArbiterService', () => {
  let service: LlmArbiterService;
  let mockLlm: jest.Mocked<LlmPort>;
  let mockModelProvider: jest.Mocked<LlmModelProviderService>;

  beforeEach(async () => {
    mockLlm = {
      generateText: jest.fn(),
      isAvailable: jest.fn(),
    };

    mockModelProvider = {
      getModel: jest.fn().mockResolvedValue(undefined), // Default: fallback to env
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmArbiterService,
        { provide: LlmPort, useValue: mockLlm },
        { provide: LlmModelProviderService, useValue: mockModelProvider },
      ],
    }).compile();

    service = module.get<LlmArbiterService>(LlmArbiterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('arbitrate', () => {
    it('should return DUPLICATE when LLM says DUPLICATE', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('DUPLICATE');
      const result = await service.arbitrate('a', 'b', 0.85);
      expect(result).toBe('DUPLICATE');
    });

    it('should return UPDATE when LLM says UPDATE', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('UPDATE');
      const result = await service.arbitrate('a', 'b', 0.8);
      expect(result).toBe('UPDATE');
    });

    it('should return DIFFERENT when LLM says DIFFERENT', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('DIFFERENT');
      const result = await service.arbitrate('a', 'b', 0.75);
      expect(result).toBe('DIFFERENT');
    });

    it('should parse noisy LLM output', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue(
        'I think this is DUPLICATE because...',
      );
      const result = await service.arbitrate('a', 'b', 0.9);
      expect(result).toBe('DUPLICATE');
    });

    it('should fail-open to DIFFERENT when LLM is unavailable', async () => {
      mockLlm.isAvailable.mockResolvedValue(false);
      const result = await service.arbitrate('a', 'b', 0.8);
      expect(result).toBe('DIFFERENT');
    });

    it('should fail-open to DIFFERENT when LLM throws', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockRejectedValue(new Error('API error'));
      const result = await service.arbitrate('a', 'b', 0.8);
      expect(result).toBe('DIFFERENT');
    });

    it('should fail-open to DIFFERENT on unparseable verdict', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('MAYBE');
      const result = await service.arbitrate('a', 'b', 0.8);
      expect(result).toBe('DIFFERENT');
    });

    it('should pass similarity in prompt', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('DIFFERENT');
      await service.arbitrate('existing', 'incoming', 0.7654);
      expect(mockLlm.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('0.7654'),
        }),
      );
    });

    it('should request maxTokens=300 by default', async () => {
      const previous = process.env.DEDUP_LLM_MAX_TOKENS;
      delete process.env.DEDUP_LLM_MAX_TOKENS;
      try {
        mockLlm.isAvailable.mockResolvedValue(true);
        mockLlm.generateText.mockResolvedValue('DUPLICATE');
        await service.arbitrate('a', 'b', 0.8);
        expect(mockLlm.generateText).toHaveBeenCalledWith(
          expect.objectContaining({ maxTokens: 300 }),
        );
      } finally {
        if (previous === undefined) {
          delete process.env.DEDUP_LLM_MAX_TOKENS;
        } else {
          process.env.DEDUP_LLM_MAX_TOKENS = previous;
        }
      }
    });

    it('should honor DEDUP_LLM_MAX_TOKENS env override', async () => {
      const previous = process.env.DEDUP_LLM_MAX_TOKENS;
      process.env.DEDUP_LLM_MAX_TOKENS = '512';
      try {
        mockLlm.isAvailable.mockResolvedValue(true);
        mockLlm.generateText.mockResolvedValue('UPDATE');
        await service.arbitrate('a', 'b', 0.8);
        expect(mockLlm.generateText).toHaveBeenCalledWith(
          expect.objectContaining({ maxTokens: 512 }),
        );
      } finally {
        if (previous === undefined) {
          delete process.env.DEDUP_LLM_MAX_TOKENS;
        } else {
          process.env.DEDUP_LLM_MAX_TOKENS = previous;
        }
      }
    });
  });

  describe('classifyRelation', () => {
    it('should forward caller-provided similarity to the prompt', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('UPDATE');
      const result = await service.classifyRelation('a', 'b', 0.9);
      expect(result.relation).toBe('update');
      expect(mockLlm.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('0.9000'),
        }),
      );
    });

    it('should default similarity to 0.85 when omitted', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('DIFFERENT');
      await service.classifyRelation('a', 'b');
      expect(mockLlm.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('0.8500'),
        }),
      );
    });
  });

  describe('buildPrompt truncation', () => {
    it('should leave short inputs untouched', async () => {
      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('DUPLICATE');
      await service.arbitrate('short existing', 'short incoming', 0.8);
      const call = mockLlm.generateText.mock.calls[0]?.[0] as {
        prompt: string;
      };
      expect(call.prompt).toContain('short existing');
      expect(call.prompt).toContain('short incoming');
      expect(call.prompt).not.toContain('… [truncated]');
    });

    it('should symmetrically truncate long existing text (head + tail preserved)', async () => {
      const head = 'A'.repeat(1500);
      const middle = 'B'.repeat(2000);
      const tail = 'Z'.repeat(800);
      const longText = `${head}${middle}${tail}`;
      const headKept = 'A'.repeat(1400);
      const tailKept = 'Z'.repeat(600);

      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('UPDATE');
      await service.arbitrate(longText, 'short incoming', 0.8);

      const call = mockLlm.generateText.mock.calls[0]?.[0] as {
        prompt: string;
      };
      expect(call.prompt).toContain('… [truncated]');
      expect(call.prompt).toContain(headKept);
      expect(call.prompt).toContain(tailKept);
      expect(call.prompt).not.toContain(middle);
      expect(call.prompt).toContain('short incoming');
    });

    it('should symmetrically truncate long incoming text (head + tail preserved)', async () => {
      const head = 'C'.repeat(1500);
      const middle = 'D'.repeat(2000);
      const tail = 'Y'.repeat(800);
      const longText = `${head}${middle}${tail}`;
      const headKept = 'C'.repeat(1400);
      const tailKept = 'Y'.repeat(600);

      mockLlm.isAvailable.mockResolvedValue(true);
      mockLlm.generateText.mockResolvedValue('UPDATE');
      await service.arbitrate('short existing', longText, 0.8);

      const call = mockLlm.generateText.mock.calls[0]?.[0] as {
        prompt: string;
      };
      expect(call.prompt).toContain('… [truncated]');
      expect(call.prompt).toContain(headKept);
      expect(call.prompt).toContain(tailKept);
      expect(call.prompt).not.toContain(middle);
      expect(call.prompt).toContain('short existing');
    });
  });
});
