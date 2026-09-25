// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  playgroundKeys,
  previewPrompt,
  type PreviewPlaygroundBody,
  type PreviewPlaygroundResult,
} from './playground-api';

import { HttpError } from '@/shared/api/http-client';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeResult(
  overrides: Partial<PreviewPlaygroundResult> = {},
): PreviewPlaygroundResult {
  return {
    renderedUserPrompt: 'TITULO: hola\nCUERPO: mundo',
    systemPrompt: 'Eres un editor crypto.',
    model: 'gpt-4o-mini',
    maxTokens: 2000,
    temperature: 0.7,
    reasoningEffort: null,
    content: null,
    ...overrides,
  };
}

describe('playgroundKeys', () => {
  it('builds a stable preview key', () => {
    expect(playgroundKeys.preview()).toEqual([
      'feed-publisher',
      'llm',
      'playground',
      'preview',
    ]);
  });
});

describe('previewPrompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the draft + sample to /feed-publisher/llm/preview', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(makeResult({ content: 'salida' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const body: PreviewPlaygroundBody = {
      draft: {
        systemPromptText: 'sys',
        promptText: '{{title}} {{original}}',
        model: 'gpt-4o-mini',
        maxTokens: 2000,
        temperature: 0.7,
        reasoningEffort: null,
        supportsVision: true,
      },
      rawTitle: 'hola',
      rawContent: 'mundo',
      hasImage: false,
      generate: true,
    };
    const result = await previewPrompt(body);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/feed-api/api/llm/preview');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(result.content).toBe('salida');
  });

  it('surfaces a 404 as HttpError so the UI can degrade gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not Found', { status: 404 })),
    );
    const outcome = await previewPrompt({ rawContent: 'x' }).then(
      () => 'resolved',
      (err: unknown) => err,
    );
    expect(outcome).toBeInstanceOf(HttpError);
    expect((outcome as HttpError).status).toBe(404);
  });
});
