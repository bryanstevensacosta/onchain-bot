import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type Capability =
  | 'PROBE_EVM'
  | 'PROBE_SVM'
  | 'MARKET_DATA'
  | 'HONEYPOT_ANALYSIS'
  | 'GECKOTERMINAL';

interface ChainCapabilitiesProps {
  readonly value: ReadonlySet<Capability>;
}

export class ChainCapabilities extends ValueObject<ChainCapabilitiesProps> {
  protected constructor(props: ChainCapabilitiesProps) {
    super(props);
  }

  public static of(capabilities: ReadonlyArray<Capability>): ChainCapabilities {
    return new ChainCapabilities({ value: new Set(capabilities) });
  }

  public static empty(): ChainCapabilities {
    return new ChainCapabilities({ value: new Set() });
  }

  public has(capability: Capability): boolean {
    return this.props.value.has(capability);
  }

  public require(capability: Capability): void {
    if (!this.has(capability)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Chain does not support capability: ${capability}`,
        { capability: [...this.props.value] },
      );
    }
  }
}
