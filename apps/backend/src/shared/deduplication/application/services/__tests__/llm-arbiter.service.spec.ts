import { Test, TestingModule } from '@nestjs/testing';
import { LlmArbiterService } from '../llm-arbiter.service';
import { LlmPort } from 'shared/llm/llm.port';

describe('LlmArbiterService', () => {
  let service: LlmArbiterService;
  let mockLlm: jest.Mocked<LlmPort>;

  beforeEach(async () => {
    mockLlm = {
      generateText: jest.fn(),
      isAvailable: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmArbiterService, { provide: LlmPort, useValue: mockLlm }],
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
  });
});
