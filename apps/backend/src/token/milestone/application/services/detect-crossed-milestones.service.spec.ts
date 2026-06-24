import { DetectCrossedMilestonesService } from './detect-crossed-milestones.service';

describe('DetectCrossedMilestonesService', () => {
  const service = new DetectCrossedMilestonesService();
  const thresholds = [2, 3, 5, 10].map((m) => ({ multiple: m }));

  it('crosses [2x] when athMultiple=2.0', () => {
    const result = service.detect({
      athMultiple: 2.0,
      enabledThresholds: thresholds,
      alreadyNotified: new Set(),
    });
    expect(result.crossed.map((c) => c.multiple)).toEqual([2]);
  });

  it('crosses [2x, 3x] when athMultiple=3.0', () => {
    const result = service.detect({
      athMultiple: 3.0,
      enabledThresholds: thresholds,
      alreadyNotified: new Set(),
    });
    expect(result.crossed.map((c) => c.multiple)).toEqual([2, 3]);
  });

  it('crosses [2x, 3x, 5x, 10x] when athMultiple=10.5', () => {
    const result = service.detect({
      athMultiple: 10.5,
      enabledThresholds: thresholds,
      alreadyNotified: new Set(),
    });
    expect(result.crossed.map((c) => c.multiple)).toEqual([2, 3, 5, 10]);
  });

  it('crosses nothing when athMultiple=1.5', () => {
    const result = service.detect({
      athMultiple: 1.5,
      enabledThresholds: thresholds,
      alreadyNotified: new Set(),
    });
    expect(result.crossed).toEqual([]);
  });

  it('crosses nothing when athMultiple=2.0 but 2x already notified', () => {
    const result = service.detect({
      athMultiple: 2.0,
      enabledThresholds: thresholds,
      alreadyNotified: new Set([2]),
    });
    expect(result.crossed).toEqual([]);
  });

  it('crosses nothing when athMultiple is null', () => {
    const result = service.detect({
      athMultiple: null,
      enabledThresholds: thresholds,
      alreadyNotified: new Set(),
    });
    expect(result.crossed).toEqual([]);
  });

  it('crosses nothing when athMultiple=0', () => {
    const result = service.detect({
      athMultiple: 0,
      enabledThresholds: thresholds,
      alreadyNotified: new Set(),
    });
    expect(result.crossed).toEqual([]);
  });

  it('crosses nothing when enabledThresholds is empty', () => {
    const result = service.detect({
      athMultiple: 10,
      enabledThresholds: [],
      alreadyNotified: new Set(),
    });
    expect(result.crossed).toEqual([]);
  });

  it('returns sorted ascending even if input is unsorted', () => {
    const unsorted = [10, 2, 5, 3].map((m) => ({ multiple: m }));
    const result = service.detect({
      athMultiple: 12,
      enabledThresholds: unsorted,
      alreadyNotified: new Set(),
    });
    expect(result.crossed.map((c) => c.multiple)).toEqual([2, 3, 5, 10]);
  });

  it('handles non-integer thresholds (e.g., 2.5x)', () => {
    const result = service.detect({
      athMultiple: 2.7,
      enabledThresholds: [{ multiple: 2.5 }, { multiple: 3 }],
      alreadyNotified: new Set(),
    });
    expect(result.crossed.map((c) => c.multiple)).toEqual([2.5]);
  });

  it('does not return duplicate thresholds', () => {
    const result = service.detect({
      athMultiple: 5,
      enabledThresholds: [
        { multiple: 2 },
        { multiple: 2 },
        { multiple: 3 },
        { multiple: 3 },
      ],
      alreadyNotified: new Set(),
    });
    expect(result.crossed.map((c) => c.multiple)).toEqual([2, 3]);
  });
});
