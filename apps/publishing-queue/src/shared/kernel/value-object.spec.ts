import { ValueObject } from './value-object';

describe('ValueObject', () => {
  class TestVo extends ValueObject<{ raw: string }> {
    constructor(raw: string) {
      super({ raw });
    }

    public get raw(): string {
      return this.value.raw;
    }
  }

  it('equals compares by structural value', () => {
    expect(new TestVo('a').equals(new TestVo('a'))).toBe(true);
    expect(new TestVo('a').equals(new TestVo('b'))).toBe(false);
    expect(new TestVo('a').equals(undefined as never)).toBe(false);
  });
});
