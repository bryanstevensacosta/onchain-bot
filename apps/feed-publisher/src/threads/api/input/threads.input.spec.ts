import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateThreadDto } from './threads.input';

describe('CreateThreadDto (v2 contract shape)', () => {
  it('accepts one or more well-formed messages', async () => {
    const dto = plainToInstance(CreateThreadDto, {
      messages: [
        { content: 'first', delaySeconds: 0 },
        { content: 'second', mediaUrls: ['https://cdn.example.com/x.png'] },
      ],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects empty lists, blank content, and negative delays', async () => {
    for (const body of [
      { messages: [] },
      { messages: [{ content: '   ' }] },
      { messages: [{ content: 'ok', delaySeconds: -1 }] },
      { messages: [{ content: 'ok', delaySeconds: 1.5 }] },
    ]) {
      const dto = plainToInstance(CreateThreadDto, body);
      expect(await validate(dto).then((errors) => errors.length)).toBeGreaterThan(
        0,
      );
    }
  });
});
