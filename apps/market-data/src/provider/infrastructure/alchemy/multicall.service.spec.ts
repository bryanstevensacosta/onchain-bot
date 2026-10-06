import type { AlchemyService } from './alchemy.service';
import { MULTICALL3_ADDRESS, MulticallService } from './multicall.service';
import { encodeTryAggregate } from './multicall.codec';

const w = (n: number | bigint): string =>
  BigInt(n).toString(16).padStart(64, '0');

function successReturn(values: ReadonlyArray<string>): string {
  const offsets: string[] = [];
  const bodies: string[] = [];
  let cursor = values.length * 32;
  values.forEach((hex) => {
    const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
    offsets.push(w(cursor));
    const body = w(1) + w(64) + w(raw.length / 2) + raw.padEnd(64, '0');
    bodies.push(body);
    cursor += body.length / 2;
  });
  return `0x${w(0x20)}${w(values.length)}${offsets.join('')}${bodies.join('')}`;
}

describe('MulticallService.tryAggregate (Lane T)', () => {
  const calls = [
    { target: `0x${'aa'.repeat(20)}`, callData: '0x70a08231' },
    { target: `0x${'bb'.repeat(20)}`, callData: '0x18160ddd' },
  ];

  function service(ethCall: jest.Mock) {
    const chainRpc = { ethCall } as unknown as AlchemyService;
    return new MulticallService(chainRpc);
  }

  it('batches partials: ok passthrough + revert as ok:false (never whole-batch fail)', async () => {
    const ethCall = jest
      .fn()
      .mockResolvedValue(
        `0x${w(0x20)}${w(2)}${w(0x40)}${w(0xc0)}` +
          `${w(1)}${w(0x40)}${w(2)}${'1234'}${'0'.repeat(60)}` +
          `${w(0)}${w(0x40)}${w(0)}`,
      );
    const res = await service(ethCall).tryAggregate('base', calls);
    expect(res).toEqual([
      { ok: true, value: '0x1234' },
      { ok: false, value: null },
    ]);
    expect(ethCall).toHaveBeenCalledTimes(1);
    const [chain, to, data, block, options] = ethCall.mock.calls[0] as [
      string,
      string,
      string,
      string,
      { signal: AbortSignal },
    ];
    expect(chain).toBe('base');
    expect(to).toBe(MULTICALL3_ADDRESS);
    expect(data).toBe(encodeTryAggregate(calls));
    expect(block).toBe('latest');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back per call when the aggregate reverts (documented fallback)', async () => {
    const ethCall = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('0xaaa')
      .mockResolvedValueOnce(null);
    const res = await service(ethCall).tryAggregate('ethereum', calls);
    expect(res).toEqual([
      { ok: true, value: '0xaaa' },
      { ok: false, value: null },
    ]);
    expect(ethCall).toHaveBeenCalledTimes(3);
    expect(ethCall.mock.calls[1][1]).toBe(calls[0].target);
    expect(ethCall.mock.calls[2][1]).toBe(calls[1].target);
  });

  it('falls back per call when the aggregate response is undecodable', async () => {
    const ethCall = jest
      .fn()
      .mockResolvedValueOnce('0xdeadbeef')
      .mockResolvedValueOnce('0x01')
      .mockResolvedValueOnce('0x02');
    const res = await service(ethCall).tryAggregate('bsc', calls);
    expect(res).toEqual([
      { ok: true, value: '0x01' },
      { ok: true, value: '0x02' },
    ]);
  });

  it('routes the robinhood aggregate via its verified Multicall3 row (todo 24)', async () => {
    const ethCall = jest.fn().mockResolvedValue(successReturn(['0x01']));
    const res = await service(ethCall).tryAggregate('robinhood', [calls[0]]);
    expect(res).toEqual([{ ok: true, value: '0x01' }]);
    expect(ethCall.mock.calls[0][0]).toBe('robinhood');
    expect(ethCall.mock.calls[0][1]).toBe(MULTICALL3_ADDRESS);
  });

  it('resolves [] with zero RPC for empty input', async () => {
    const ethCall = jest.fn();
    await expect(service(ethCall).tryAggregate('base', [])).resolves.toEqual(
      [],
    );
    expect(ethCall).not.toHaveBeenCalled();
  });

  it('successReturn helper sanity: 2 values decode in order', async () => {
    const ethCall = jest
      .fn()
      .mockResolvedValue(successReturn(['0xaa', '0xbbcc']));
    const res = await service(ethCall).tryAggregate('polygon', calls);
    expect(res).toEqual([
      { ok: true, value: '0xaa' },
      { ok: true, value: '0xbbcc' },
    ]);
  });
});
