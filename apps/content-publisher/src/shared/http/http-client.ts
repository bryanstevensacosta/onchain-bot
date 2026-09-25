import axios, { AxiosInstance } from 'axios';
import { DEFAULT_RETRY_POLICY, RetryPolicyOptions, withRetry } from './retry-policy';

/**
 * SharedHttpClient (Tramo 2, todo 1).
 *
 * Thin axios wrapper with bounded retry + default timeout for all
 * outbound calls (feed reads, Bot API, LLM gateway). Per-feature
 * adapters inject this instead of raw axios.
 */
export class SharedHttpClient {
  private readonly axios: AxiosInstance;

  constructor(
    private readonly retry: RetryPolicyOptions = DEFAULT_RETRY_POLICY,
    timeoutMs = 10_000,
  ) {
    this.axios = axios.create({ timeout: timeoutMs });
  }

  public async get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return withRetry(async () => {
      const response = await this.axios.get<T>(url, { headers });
      return response.data;
    }, this.retry);
  }

  public async post<T>(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return withRetry(async () => {
      const response = await this.axios.post<T>(url, body, { headers });
      return response.data;
    }, this.retry);
  }
}
