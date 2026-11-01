// Display-only labels; the contract only ever sees raw addresses.
const NAMES: Record<string, string> = {
  "0x6d24eb6a3fd6efb062625e4263cd1438db57fbec": "Leader",
  "0x40e8cc7620c4c2857bf3ed3a688c8bdd7f391fec": "Alice",
  "0x595e83c384780506a12c2411ade4ad2ce337db26": "TaskEscrow Contract",
};

export const nameOf = (addr?: string) => (addr ? NAMES[addr.toLowerCase()] : undefined);

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "?");

export const labelOf = (addr?: string) => {
  const n = nameOf(addr);
  return n ? `${n} (${shortAddr(addr)})` : shortAddr(addr);
};
