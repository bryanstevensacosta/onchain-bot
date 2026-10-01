/** Scopes for inter-app service auth (todo 2). `admin` implies `send`. */
export type ClientScope = 'send' | 'admin';

export interface ClientCredential {
  readonly id: string;
  readonly secret: string;
  readonly scopes: readonly ClientScope[];
}
