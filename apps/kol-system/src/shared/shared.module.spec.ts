import { Test, TestingModule } from '@nestjs/testing';
import { SharedModule } from './shared.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { DomainExceptionFilter } from './filters/domain-exception.filter';

describe('SharedModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [SharedModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('compiles and provides the guard and filter', () => {
    expect(module.get(SharedModule)).toBeDefined();
    expect(module.get(ApiKeyGuard)).toBeInstanceOf(ApiKeyGuard);
    expect(module.get(DomainExceptionFilter)).toBeInstanceOf(
      DomainExceptionFilter,
    );
  });
});
