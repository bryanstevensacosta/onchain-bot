export class TelegramClient {
  constructor(
    public apiId: number,
    public apiHash: string,
    public options?: any,
  ) {}
  async start() {
    return this;
  }
  async invoke() {
    return {};
  }
}
export class StringSession {
  constructor(public session: string) {}
}
export class NewMessage {}
