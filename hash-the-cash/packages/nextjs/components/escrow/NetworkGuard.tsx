"use client";

import { useAccount } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

/**
 * Tells the visitor what they need to do before any button will work:
 * connect a wallet, and be on the network the contract is deployed to.
 */
export const NetworkGuard = () => {
  const { address, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  if (!address) {
    return (
      <div className="stock p-4">
        <span>Connect MetaMask to take any action. You can read the whole task board without connecting.</span>
      </div>
    );
  }

  if (chain && chain.id !== targetNetwork.id) {
    return (
      <div className="stock p-4 border border-[var(--color-error)]">
        <span>
          Wrong network: your wallet is on <b>{chain.name}</b>. Switch it to <b>{targetNetwork.name}</b> to send
          transactions.
        </span>
      </div>
    );
  }

  return null;
};
