import {
  SessionBindingAuthorizer,
  type SessionRecord,
} from '../../domain/ports/session-binding.authorizer';

export class InMemorySessionAuthorizer extends SessionBindingAuthorizer {
  private readonly rows = new Map<string, SessionRecord>();

  public async findSession(sessionId: string): Promise<SessionRecord | null> {
    return this.rows.get(sessionId) ?? null;
  }

  public async seed(session: SessionRecord): Promise<void> {
    this.rows.set(session.sessionId, {
      ...session,
      bindings: session.bindings.map((binding) => ({ ...binding })),
    });
  }
}
