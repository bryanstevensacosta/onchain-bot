import { resolveAiMlBaseUrl } from '../ai-ml-mode';

/**
 * Minimal fetch wrapper for the ai-ml HTTP surface (ai-ml plan todo 3).
 *
 * Mirrors the ingestion-telegram client shape (base URL + `x-api-key`
 * from day one, fail-open keyless dev): `AI_ML_URL` (default
 * loopback `:4090`) + `AI_ML_API_KEY` (empty = keyless). Timeouts are
 * bounded per call (`AI_ML_TIMEOUT_MS`, default 8000) so a hung ai-ml
 * never stalls the drain — the dual adapters treat timeouts as
 * `skipped`, the `ai-ml` serving mode fails closed.
 */
export class AiMlHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(
      'ai-ml request failed (status=' +
        status +
        ', path=' +
        path +
        '): ' +
        message,
    );
    this.name = 'AiMlHttpError';
  }
}

export interface AiMlHttpOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
}

export const resolveAiMlHttpOptions = (
  get: (key: string, fallback?: unknown) => unknown,
): AiMlHttpOptions => {
  const baseRaw = get('AI_ML_URL');
  const keyRaw = get('AI_ML_API_KEY');
  const timeoutRaw = get('AI_ML_TIMEOUT_MS');
  const parsedTimeout = Number(
    typeof timeoutRaw === 'string' && timeoutRaw.trim().length > 0
      ? timeoutRaw
      : '8000',
  );
  return {
    baseUrl: resolveAiMlBaseUrl(typeof baseRaw === 'string' ? baseRaw : ''),
    apiKey: typeof keyRaw === 'string' ? keyRaw.trim() : '',
    timeoutMs:
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : 8000,
  };
};

const headersFor = (apiKey: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey.length > 0) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
};

const readErrorBody = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === 'string' && body.length > 0) {
      return body;
    }
    if (body !== null && typeof body === 'object') {
      const error = (body as Record<string, unknown>)['error'];
      if (typeof error === 'string' && error.length > 0) {
        return error;
      }
      return JSON.stringify(body).slice(0, 300);
    }
    return 'empty error body';
  } catch {
    return 'unreadable error body';
  }
};

export const aiMlGet = async <T>(
  options: AiMlHttpOptions,
  path: string,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(options.baseUrl + path, {
      headers: headersFor(options.apiKey),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    throw new Error(
      'ai-ml request failed (path=' +
        path +
        '): ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  if (!response.ok) {
    throw new AiMlHttpError(
      response.status,
      path,
      await readErrorBody(response),
    );
  }
  return (await response.json()) as T;
};

export const aiMlPost = async <T>(
  options: AiMlHttpOptions,
  path: string,
  body: unknown,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(options.baseUrl + path, {
      method: 'POST',
      headers: headersFor(options.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    throw new Error(
      'ai-ml request failed (path=' +
        path +
        '): ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  if (!response.ok) {
    throw new AiMlHttpError(
      response.status,
      path,
      await readErrorBody(response),
    );
  }
  return (await response.json()) as T;
};
