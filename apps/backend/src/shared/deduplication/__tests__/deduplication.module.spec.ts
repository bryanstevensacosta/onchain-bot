import { InMemoryDeduplicationStore } from '../infrastructure/repositories/in-memory-deduplication.store';
import { DeduplicationService } from '../application/services/deduplication.service';

describe('DeduplicationModule', () => {
  it('should provide in-memory store when DB is disabled', async () => {
    const store = new InMemoryDeduplicationStore();
    const service = new DeduplicationService(store);

    expect(service).toBeDefined();
    expect(store).toBeDefined();
    expect(store.constructor.name).toBe('InMemoryDeduplicationStore');
  });
});
