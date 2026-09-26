import { Entity } from './entity';

class TestEntity extends Entity<string> {
  constructor(id: string) {
    super(id);
  }
}

class OtherEntity extends Entity<string> {
  constructor(id: string) {
    super(id);
  }
}

describe('Entity', () => {
  it('exposes its id', () => {
    expect(new TestEntity('e-1').id).toBe('e-1');
  });

  it('equals by id, not by reference', () => {
    expect(new TestEntity('e-1').equals(new TestEntity('e-1'))).toBe(true);
    expect(new TestEntity('e-1').equals(new TestEntity('e-2'))).toBe(false);
  });

  it('rejects null, undefined, and other entity classes', () => {
    const entity = new TestEntity('e-1');
    expect(entity.equals(null)).toBe(false);
    expect(entity.equals(undefined)).toBe(false);
    expect(entity.equals(new OtherEntity('e-1'))).toBe(false);
  });
});
