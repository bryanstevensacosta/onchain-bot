import { AccessAuditService } from './access-audit.service';

describe('AccessAuditService (P46)', () => {
  it('records who/when/endpoint without ever storing key material', () => {
    const audit = new AccessAuditService();
    audit.record({ keyId: 'k1', keyName: 'kol-system', method: 'GET', path: '/api/v1/chains', status: 200 });
    const entries = audit.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].keyId).toBe('k1');
    expect(entries[0].method).toBe('GET');
    const blob = JSON.stringify(entries);
    expect(blob).not.toMatch(/md_/);
    expect(blob).not.toMatch(/keyHash/);
  });

  it('caps the buffer (ring, no unbounded growth)', () => {
    const audit = new AccessAuditService(3);
    for (let i = 0; i < 5; i += 1) {
      audit.record({ keyId: `k${i}`, keyName: 'n', method: 'GET', path: '/x', status: 200 });
    }
    expect(audit.list()).toHaveLength(3);
  });
});
