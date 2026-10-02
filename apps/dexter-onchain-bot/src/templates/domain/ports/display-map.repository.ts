import type { DisplayMap } from '../display-map.entity';

/**
 * Outbound port: persistence for the DisplayMap catalog
 * (display-catalog rename). FK-less by design. The TypeORM adapter lives alongside the
 * in-memory adapter (live binding when `DATABASE_ENABLED=false`;
 * todo 13 wires the switch).
 */
export abstract class DisplayMapRepository {
  public abstract findAll(): Promise<readonly DisplayMap[]>;
  public abstract findByKey(
    placeholderKey: string,
  ): Promise<readonly DisplayMap[]>;
  public abstract findOne(id: string): Promise<DisplayMap | null>;
  public abstract save(map: DisplayMap): Promise<DisplayMap>;
  public abstract delete(id: string): Promise<boolean>;
}
