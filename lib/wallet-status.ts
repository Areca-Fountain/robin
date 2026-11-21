// Small helper shared by the server and the browser.
// A company created by a registrar starts with a placeholder instead of a real
// wallet address. This tells the two cases apart.

import { walletKey } from "@/lib/wallet-key";

/** What registrars store until the company connects its own wallet */
export const WALLET_PLACEHOLDER = "Pending Company Wallet Connection";

/** True when the stored value is a real Cardano address we can match against Lace */
export function hasRealWallet(address: string | null | undefined): boolean {
  if (!address) return false;
  return walletKey(address) !== null;
}