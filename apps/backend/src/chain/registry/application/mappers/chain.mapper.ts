import { ChainId } from 'chain/identity/chain-id.vo';
import type { Chain } from 'chain/registry/domain/entities/chain.entity';

export interface ChainView {
  readonly id: string;
  readonly family: 'evm' | 'solana';
  readonly displayName: string;
  readonly nativeSymbol: string;
  readonly blockExplorerUrl: string | null;
  readonly geckoTerminalSlug: string | null;
}

export const ChainMapper = {
  toView(chain: Chain): ChainView {
    return {
      id: chain.value,
      family: chain.family.value,
      displayName: chain.displayName,
      nativeSymbol: chain.nativeSymbol,
      blockExplorerUrl: chain.blockExplorerUrl,
      geckoTerminalSlug: chain.geckoTerminalSlug,
    };
  },
  chainId(view: { id: string }): ChainId {
    return ChainId.fromString(view.id);
  },
};
