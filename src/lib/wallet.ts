// Coins + prizes, kept on this device (localStorage). Read defensively: users can edit storage.
// `apply` decides synchronously from a ref (React state updaters may run later), so "can I
// afford this?" is answered before the game starts.
import { useCallback, useRef, useState } from "react";
import { emptyWallet, parseWallet, type Wallet } from "../../shared/economy";

const KEY = "rap.wallet.v1";

function load(): Wallet {
  try { return parseWallet(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return emptyWallet(); }
}

export function useWallet() {
  const [wallet, setWallet] = useState<Wallet>(load);
  const ref = useRef(wallet);
  const apply = useCallback((fn: (w: Wallet) => Wallet | null): boolean => {
    const next = fn(ref.current);
    if (!next) return false;
    if (next === ref.current) return true;
    ref.current = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: memory only */ }
    setWallet(next);
    return true;
  }, []);
  return [wallet, apply] as const;
}
