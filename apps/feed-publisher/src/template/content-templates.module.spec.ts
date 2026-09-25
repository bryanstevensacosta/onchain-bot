import { Test } from '@nestjs/testing';
import { ContentTemplatesModule } from './content-templates.module';

describe('ContentTemplatesModule', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      imports: [ContentTemplatesModule],
    }).compile();
    expect(module.get(ContentTemplatesModule)).toBeDefined();
    await module.close();
  });
});
