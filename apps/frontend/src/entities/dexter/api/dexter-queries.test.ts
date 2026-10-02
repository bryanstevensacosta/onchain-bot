import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/http-client', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPatch: vi.fn(),
  httpPut: vi.fn(),
  httpDelete: vi.fn(),
}));

import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import {
  activateDexterTemplate,
  createDexterTemplate,
  createDisplayMap,
  deleteDexterTemplate,
  deleteDisplayMap,
  dexterKeys,
  fetchDexterTemplate,
  fetchDexterTemplates,
  fetchDisplayMaps,
  fetchPlaceholders,
  previewDexterTemplate,
  updateDexterTemplate,
  updateDisplayMap,
} from './dexter-queries';
import { isPreviewUnresolved } from '../model/types';

const mockedHttpGet = httpGet as unknown as ReturnType<typeof vi.fn>;
const mockedHttpPost = httpPost as unknown as ReturnType<typeof vi.fn>;
const mockedHttpPatch = httpPatch as unknown as ReturnType<typeof vi.fn>;
const mockedHttpDelete = httpDelete as unknown as ReturnType<typeof vi.fn>;

describe('dexter-queries URL pinning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchDexterTemplates hits the list without query when unfiltered', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchDexterTemplates();
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates',
    );
  });

  it('fetchDexterTemplates appends ?command= when filtered', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchDexterTemplates('x');
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates?command=x',
    );
  });

  it('fetchDexterTemplate hits the by-id route', async () => {
    mockedHttpGet.mockResolvedValue({});
    await fetchDexterTemplate('abc');
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates/abc',
    );
  });

  it('createDexterTemplate POSTs the list route with the body', async () => {
    mockedHttpPost.mockResolvedValue({});
    const body = { command: 'x', name: 'v1', bodyMarkdown: '{{symbol}}' };
    await createDexterTemplate(body);
    expect(mockedHttpPost).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates',
      body,
    );
  });

  it('updateDexterTemplate PATCHes the by-id route', async () => {
    mockedHttpPatch.mockResolvedValue({});
    const body = { name: 'v2' };
    await updateDexterTemplate('abc', body);
    expect(mockedHttpPatch).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates/abc',
      body,
    );
  });

  it('deleteDexterTemplate DELETEs the by-id route', async () => {
    mockedHttpDelete.mockResolvedValue(undefined);
    await deleteDexterTemplate('abc');
    expect(mockedHttpDelete).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates/abc',
    );
  });

  it('activateDexterTemplate POSTs the activate route with an empty body', async () => {
    mockedHttpPost.mockResolvedValue({});
    await activateDexterTemplate('abc');
    expect(mockedHttpPost).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates/abc/activate',
      {},
    );
  });

  it('previewDexterTemplate POSTs the preview route with templateId XOR draft', async () => {
    mockedHttpPost.mockResolvedValue({ text: 'hi' });
    const body = { templateId: 'abc', address: 'So1111' };
    await previewDexterTemplate(body);
    expect(mockedHttpPost).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/templates/preview',
      body,
    );
  });

  it('fetchPlaceholders hits the per-command catalog route', async () => {
    mockedHttpGet.mockResolvedValue({ command: 'x', placeholders: [] });
    await fetchPlaceholders('x');
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/placeholders/x',
    );
  });

  it('fetchDisplayMaps hits the list without query when unfiltered', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchDisplayMaps();
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/display-maps',
    );
  });

  it('fetchDisplayMaps appends ?placeholderKey= when filtered', async () => {
    mockedHttpGet.mockResolvedValue([]);
    await fetchDisplayMaps('chainDisplay');
    expect(mockedHttpGet).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/display-maps?placeholderKey=chainDisplay',
    );
  });

  it('createDisplayMap POSTs the wire field display (NOT emoji)', async () => {
    mockedHttpPost.mockResolvedValue({});
    const body = {
      placeholderKey: 'chainDisplay',
      matchValue: 'solana',
      display: '🟣',
    };
    await createDisplayMap(body);
    expect(mockedHttpPost).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/display-maps',
      body,
    );
    expect(Object.keys(body)).not.toContain('emoji');
  });

  it('updateDisplayMap PATCHes the by-id route', async () => {
    mockedHttpPatch.mockResolvedValue({});
    await updateDisplayMap('abc', { display: '🔵' });
    expect(mockedHttpPatch).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/display-maps/abc',
      { display: '🔵' },
    );
  });

  it('deleteDisplayMap DELETEs the by-id route', async () => {
    mockedHttpDelete.mockResolvedValue(undefined);
    await deleteDisplayMap('abc');
    expect(mockedHttpDelete).toHaveBeenCalledWith(
      '/dexter-api/api/dexter/display-maps/abc',
    );
  });
});

describe('dexterKeys', () => {
  it('roots every key under dexter', () => {
    expect(dexterKeys.all).toEqual(['dexter']);
    expect(dexterKeys.templates[0]).toBe('dexter');
    expect(dexterKeys.displayMaps[0]).toBe('dexter');
    expect(dexterKeys.template('abc')).toEqual(['dexter', 'template', 'abc']);
    expect(dexterKeys.placeholders('x')).toEqual([
      'dexter',
      'placeholders',
      'x',
    ]);
  });
});

describe('isPreviewUnresolved', () => {
  it('flags error shapes as unresolved', () => {
    expect(
      isPreviewUnresolved({ error: 'Token not found', address: 'So1111' }),
    ).toBe(true);
  });

  it('passes rendered results through', () => {
    expect(
      isPreviewUnresolved({
        text: 'hi',
        truncated: false,
        parseMode: 'MarkdownV2',
        placeholdersUsed: ['symbol'],
        unknown: [],
      }),
    ).toBe(false);
  });
});
