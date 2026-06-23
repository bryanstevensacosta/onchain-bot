import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { ChainId } from 'chain/identity/chain-id.vo';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { ChainCapabilities } from 'chain/registry/domain/value-objects/chain-capabilities.vo';

export interface ChainProps {
  readonly family: ChainFamily;
  readonly displayName: string;
  readonly nativeSymbol: string;
  readonly blockExplorerUrl: string | null;
  readonly capabilities: ChainCapabilities;
  readonly geckoTerminalSlug: string | null;
}

/**
 * Aggregate root: a single chain in the registry.
 *
 * Identity: `ChainId` (network-level). Same instance for both lookup
 * by id and by family filtering.
 *
 * Capabilities are declarative — adapters query them via the registry
 * instead of hardcoding `supportedChains` arrays.
 */
export class Chain extends AggregateRoot<ChainId> {
  private readonly state: ChainProps;

  protected constructor(id: ChainId, props: ChainProps) {
    super(id);
    this.state = props;
  }

  public static create(id: ChainId, props: ChainProps): Chain {
    return new Chain(id, props);
  }

  public override get id(): ChainId {
    return this._id;
  }

  public get value(): ChainId['value'] {
    return this._id.value;
  }

  public get family(): ChainFamily {
    return this.state.family;
  }

  public get displayName(): string {
    return this.state.displayName;
  }

  public get nativeSymbol(): string {
    return this.state.nativeSymbol;
  }

  public get blockExplorerUrl(): string | null {
    return this.state.blockExplorerUrl;
  }

  public get capabilities(): ChainCapabilities {
    return this.state.capabilities;
  }

  public get geckoTerminalSlug(): string | null {
    return this.state.geckoTerminalSlug;
  }

  public supports(
    capability: Parameters<ChainCapabilities['has']>[0],
  ): boolean {
    return this.state.capabilities.has(capability);
  }

  protected mutate(): void {
    // Chain is immutable in the registry (static catalog for v1).
  }
}
