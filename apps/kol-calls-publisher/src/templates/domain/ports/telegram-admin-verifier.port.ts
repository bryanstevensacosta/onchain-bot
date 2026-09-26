export interface VerifyAdminInput {
  readonly botToken: string;
  readonly channelTarget: string;
}

/**
 * Bot API admin check (P23-bis): `getChatMember` must report
 * `administrator` or `creator` for the bot in the target channel before a
 * template may publish there. Fail-closed: transport errors → false.
 */
export abstract class TelegramAdminVerifierPort {
  public abstract verifyAdmin(input: VerifyAdminInput): Promise<boolean>;
}
