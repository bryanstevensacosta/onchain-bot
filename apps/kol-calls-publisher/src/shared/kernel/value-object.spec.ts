import { ValueObject } from './value-object';

interface TestProps {
  name: string;
  score: number;
  nested: { flag: boolean };
}

class TestVO extends ValueObject<TestProps> {
  constructor(props: TestProps) {
    super(props);
  }

  public get name(): string {
    return this.toObject().name;
  }
}

class OtherVO extends ValueObject<TestProps> {
  constructor(props: TestProps) {
    super(props);
  }
}

const props = (): TestProps => ({
  name: 'kol-1',
  score: 80,
  nested: { flag: true },
});

describe('ValueObject', () => {
  it('equals compares by value, not reference', () => {
    expect(new TestVO(props()).equals(new TestVO(props()))).toBe(true);
  });

  it('detects differing props', () => {
    const other = props();
    other.score = 10;
    expect(new TestVO(props()).equals(new TestVO(other))).toBe(false);
  });

  it('detects differing nested props', () => {
    const other = props();
    other.nested = { flag: false };
    expect(new TestVO(props()).equals(new TestVO(other))).toBe(false);
  });

  it('never equals null, undefined, or another VO class', () => {
    const vo = new TestVO(props());
    expect(vo.equals(null)).toBe(false);
    expect(vo.equals(undefined)).toBe(false);
    expect(vo.equals(new OtherVO(props()))).toBe(false);
  });

  it('freezes props and exposes a safe copy via toObject', () => {
    const vo = new TestVO(props());
    const exposed = vo.toObject();
    expect(exposed).toEqual(props());
    expect(Object.isFrozen((vo as unknown as { props: unknown }).props)).toBe(
      true,
    );
    (exposed as { name: string }).name = 'mutated';
    expect(vo.name).toBe('kol-1');
  });
});
