import axios, { AxiosInstance } from 'axios';

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: string;
  readonly params: ReadonlyArray<unknown>;
}

export interface JsonRpcResponse<T> {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: T;
  readonly error?: { code: number; message: string };
}

/**
 * Lightweight JSON-RPC 2.0 HTTP client.
 *
 * Uses axios directly (not @nestjs/axios) to keep this BC self-contained.
 * Returns the raw `result` field; throws on transport or RPC error.
 */
export class JsonRpcClient {
  private readonly http: AxiosInstance;

  public constructor(
    public readonly endpoint: string,
    timeoutMs = 5000,
  ) {
    this.http = axios.create({ timeout: timeoutMs });
  }

  public async call<T>(
    method: string,
    params: ReadonlyArray<unknown>,
    id = 1,
  ): Promise<T> {
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const { data } = await this.http.post<JsonRpcResponse<T>>(
      this.endpoint,
      body,
    );
    if (data.error) {
      throw new Error(
        `JSON-RPC error ${data.error.code}: ${data.error.message}`,
      );
    }
    if (data.result === undefined) {
      throw new Error(`JSON-RPC response missing result`);
    }
    return data.result;
  }
}
