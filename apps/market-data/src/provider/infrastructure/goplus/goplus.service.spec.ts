import axios from 'axios';
import { GoplusService } from './goplus.service';

/**
 * GoPlus `token_security` adapter (dexter plan todo 71 + D1/D3).
 * Wire-level pins only — the parsing/classification table lives in
 * `snapshot/domain/snapshot-honeypot.spec.ts`; this spec proves the
 * adapter sends the ONE-address request, maps live envelopes (taxes +
 * SIM + LP lock), and resolves `transient` (never throws) on every
 * transport gap.
 */

const SAFEMOONCASH = '0xF017E2773e4ee0590C81D79ccbcF1B2De1D22877';
const SAFEMOONCASH_LOWER = SAFEMOONCASH.toLowerCase();
const KODA = '0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

const SAFEMOONCASH_BODY = {
  code: 1,
  message: 'OK',
  result: {
    [SAFEMOONCASH_LOWER]: { buy_tax: '0.04', sell_tax: '0.02' },
  },
};

/** Live KODA BSC witness (2026-10-22), trimmed to the mapped fields. */
const KODA_BODY = {
  code: 1,
  message: 'OK',
  result: {
    [KODA.toLowerCase()]: {
      is_honeypot: '0',
      cannot_buy: '0',
      cannot_sell_all: '0',
      buy_tax: '0',
      sell_tax: '0.0297',
      lp_holder_count: 2,
      lp_holders: [
        {
          address: '0x4079e1d1a1c6c4d3f9d8cb6a7b0b8f9e9f1a1bbe',
          percent: '0.999999999999999999',
          is_locked: 1,
        },
        {
          address: '0x0000000000000000000000000000000000000000',
          percent: '0',
          is_locked: 1,
        },
      ],
    },
  },
};

/** Live CAKE bsc witness: entry present, tax keys + lp_holders absent. */
const CAKE_BODY = {
  code: 1,
  message: 'OK',
  result: {
    [CAKE.toLowerCase()]: { is_honeypot: '0' },
  },
};

describe('GoplusService.getTokenSecurity (todo 71 Fase 1)', () => {
  const service = new GoplusService();

  afterEach(() => jest.restoreAllMocks());

  it('sends ONE address per request to the chain-scoped keyless endpoint', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: SAFEMOONCASH_BODY,
    });
    const probe = await service.getTokenSecurity(56, SAFEMOONCASH);
    expect(spy).toHaveBeenCalledWith(
      'https://api.gopluslabs.io/api/v1/token_security/56',
      expect.objectContaining({
        params: { contract_addresses: SAFEMOONCASH },
        timeout: 2_000,
      }),
    );
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 4, sell: 2, sim: null },
      lpLock: null,
    });
  });

  it('KODA body: sim ok + lpLock {100, 0} from the same call', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: KODA_BODY });
    const probe = await service.getTokenSecurity(56, KODA);
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: 0, sell: 2.97, sim: 'ok' },
      lpLock: { lockedPercent: 100, burnedPercent: 0 },
    });
  });

  it('body without lp_holders: lpLock null, sim ok when is_honeypot is present', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: CAKE_BODY });
    const probe = await service.getTokenSecurity(56, CAKE);
    expect(probe).toEqual({
      kind: 'reading',
      reading: { buy: null, sell: null, sim: 'ok' },
      lpLock: null,
    });
  });

  it('trims the address before sending', async () => {
    const spy = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: SAFEMOONCASH_BODY });
    await service.getTokenSecurity(1, `  ${SAFEMOONCASH}  `);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/token_security/1'),
      expect.objectContaining({
        params: { contract_addresses: SAFEMOONCASH },
      }),
    );
  });

  it('maps the HTTP-200 chain-unsupported body (code 2022) to definitive absence', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        code: 2022,
        message: 'The main chain is not supported',
        result: null,
      },
    });
    await expect(service.getTokenSecurity(999, SAFEMOONCASH)).resolves.toEqual({
      kind: 'definitive-absence',
    });
  });

  it('maps a code-1 success with the address absent to definitive absence', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { code: 1, message: 'OK', result: {} },
    });
    await expect(service.getTokenSecurity(56, SAFEMOONCASH)).resolves.toEqual({
      kind: 'definitive-absence',
    });
  });

  it('maps broken/odd envelopes to transient (never throws)', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: undefined });
    await expect(service.getTokenSecurity(56, SAFEMOONCASH)).resolves.toEqual({
      kind: 'transient',
    });
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { code: 5000, message: 'oops', result: null },
    });
    await expect(service.getTokenSecurity(56, SAFEMOONCASH)).resolves.toEqual({
      kind: 'transient',
    });
  });

  it('maps network/timeout/5xx rejections to transient (fail-open, never rejects)', async () => {
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue(new Error('timeout of 2000ms exceeded'));
    await expect(service.getTokenSecurity(56, SAFEMOONCASH)).resolves.toEqual({
      kind: 'transient',
    });
    jest.spyOn(axios, 'get').mockRejectedValue({
      response: { status: 503 },
    });
    await expect(service.getTokenSecurity(56, SAFEMOONCASH)).resolves.toEqual({
      kind: 'transient',
    });
  });

  it('guards invalid chain ids and blank addresses BEFORE the network', async () => {
    const spy = jest.spyOn(axios, 'get');
    for (const chainId of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      await expect(
        service.getTokenSecurity(chainId, SAFEMOONCASH),
      ).resolves.toEqual({ kind: 'transient' });
    }
    await expect(service.getTokenSecurity(56, '   ')).resolves.toEqual({
      kind: 'transient',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
