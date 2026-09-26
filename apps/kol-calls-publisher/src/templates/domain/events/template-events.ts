import { DomainEvent } from '../../../shared/kernel/domain-event';

/**
 * Emitted when a template is created (seed or API).
 */
export class TemplateCreatedEvent extends DomainEvent {
  public readonly payload: {
    readonly templateId: string;
    readonly name: string;
  };

  public constructor(payload: { templateId: string; name: string }) {
    super('templates.template.created', payload.templateId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}

/**
 * Emitted when a template is activated or deactivated.
 */
export class TemplateActivatedEvent extends DomainEvent {
  public readonly payload: {
    readonly templateId: string;
    readonly active: boolean;
  };

  public constructor(payload: { templateId: string; active: boolean }) {
    super('templates.template.activated', payload.templateId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}

/**
 * Emitted when the source selector of a template changes (P16).
 */
export class TemplateSourceConfigUpdatedEvent extends DomainEvent {
  public readonly payload: {
    readonly templateId: string;
    readonly kolSourceIds: ReadonlyArray<string>;
  };

  public constructor(payload: {
    templateId: string;
    kolSourceIds: ReadonlyArray<string>;
  }) {
    super('templates.template.sources-updated', payload.templateId);
    this.payload = Object.freeze({
      ...payload,
      kolSourceIds: [...payload.kolSourceIds],
    });
  }

  public toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
