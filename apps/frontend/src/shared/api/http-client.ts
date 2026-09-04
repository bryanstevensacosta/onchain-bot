import { API_BASE_URL } from '@/shared/config/env';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function httpGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, body, `GET ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function httpPost<TBody, TResp = unknown>(
  path: string,
  body: TBody,
): Promise<TResp> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let errorMessage = `POST ${path} → ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.message) {
        errorMessage = json.message;
      }
    } catch {
      // Not JSON or no message field, use default
    }
    throw new HttpError(res.status, text, errorMessage);
  }
  return (await res.json()) as TResp;
}

export async function httpPostForm<TResp = unknown>(
  path: string,
  formData: FormData,
): Promise<TResp> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(res.status, text, `POST ${path} → ${res.status}`);
  }
  return (await res.json()) as TResp;
}

export async function httpPatch<TBody, TResp = unknown>(
  path: string,
  body: TBody,
): Promise<TResp> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(res.status, text, `PATCH ${path} → ${res.status}`);
  }
  return (await res.json()) as TResp;
}

export async function httpDelete<TResp = unknown>(
  path: string,
): Promise<TResp> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(res.status, text, `DELETE ${path} → ${res.status}`);
  }
  return (await res.json()) as TResp;
}
