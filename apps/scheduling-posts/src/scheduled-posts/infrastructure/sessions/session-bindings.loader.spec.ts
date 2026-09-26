import { parseSessionBindings } from './session-bindings.loader';

describe('parseSessionBindings', () => {
  it('parses seeded sessions with verified bindings', () => {
    const rows = parseSessionBindings(
      JSON.stringify([
        {
          sessionId: 'morning-desk',
          active: true,
          bindings: [
            {
              bindingId: 'b-1',
              target: 'telegram',
              botId: 'bot_X',
              defaultChatId: '-100123',
              botVerified: true,
              publishDelayMs: 60_000,
              dailyCap: 10,
            },
          ],
        },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].bindings[0]).toMatchObject({ bindingId: 'b-1', dailyCap: 10 });
  });

  it('fails safe to zero bindings on empty or malformed input (P38-ter 409 downstream)', () => {
    expect(parseSessionBindings('')).toEqual([]);
    expect(parseSessionBindings('not-json')).toEqual([]);
    expect(parseSessionBindings(JSON.stringify([{ nope: true }]))).toEqual([]);
  });
});
