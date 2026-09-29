/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL hot path moved to
 * apps/kol-calls (ingestion/extraction/parsing/normalization) +
 * apps/kol-calls-publisher (scoring/templates/approval/publishing).
 * Refactor target: delete this file at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';

export abstract class KolEventPublisher extends DomainEventPublisher {}
