export type IngressMode = 'webhook' | 'polling';

export interface UpdateSubscriber {
  readonly appId: string;
  readonly url: string;
  readonly secret?: string;
}

export interface IngressRoute {
  readonly botId: string;
  readonly webhookSecret: string;
  readonly mode: IngressMode;
  readonly subscribers: readonly UpdateSubscriber[];
}

export interface MutableIngressRoute {
  botId: string;
  webhookSecret: string;
  mode: IngressMode;
  subscribers: UpdateSubscriber[];
}
