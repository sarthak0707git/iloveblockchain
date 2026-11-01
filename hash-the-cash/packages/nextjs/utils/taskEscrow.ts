import { keccak256 } from "viem";

// Mirrors `enum Status` in TaskEscrow.sol
export const STATUS = { None: 0, Assigned: 1, Submitted: 2, Paid: 3, Cancelled: 4 } as const;

export const STATUS_LABEL: Record<number, string> = {
  0: "None",
  1: "Assigned",
  2: "Submitted",
  3: "Paid",
  4: "Cancelled",
};

export const STATUS_BADGE: Record<number, string> = {
  0: "badge-ghost",
  1: "badge-info",
  2: "badge-warning",
  3: "badge-success",
  4: "badge-neutral",
};

export type Task = {
  assignee: string;
  reward: bigint;
  deadline: bigint;
  submittedAt: bigint;
  status: number;
  title: string;
  specURI: string;
  workURI: string;
  workHash: `0x${string}`;
};

export const ZERO_HASH = `0x${"0".repeat(64)}` as const;

const ERROR_MESSAGES: Record<string, string> = {
  NotLeader: "Only the team leader can do this.",
  NotAssignee: "Only the assigned teammate can do this.",
  NotMember: "That address is not a team member.",
  BadAddress: "That address can't be added (zero address or the leader).",
  BadDeadline: "The deadline must be in the future.",
  BadReviewPeriod: "Invalid review period.",
  NoReward: "The reward must be more than 0 ETH.",
  EmptyWork: "A work link and a file hash are both required.",
  WrongStatus: "This task isn't in the right state for that (already paid, cancelled or under review).",
  DeadlinePassed: "The submission deadline has passed.",
  DeadlineNotPassed: "You can only cancel after the deadline has passed.",
  ReviewWindowOpen: "The review window is still open. Try again when the countdown ends.",
  ReviewWindowClosed: "The review window has closed, so the teammate can now claim payment.",
  TransferFailed: "The ETH transfer failed.",
  Reentrancy: "Blocked: re-entrant call.",
};

/** Turns a parsed revert message such as "...reason:\nNotLeader()" into a human sentence. */
export const humanizeError = (message: string): string => {
  if (/user (rejected|denied)/i.test(message)) return "Transaction cancelled in your wallet.";
  const match = message.match(/\b([A-Z][A-Za-z]+)\(\)/);
  if (match && ERROR_MESSAGES[match[1]]) return ERROR_MESSAGES[match[1]];
  return message;
};

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/**
 * Returns a safe href for user-supplied URIs, or null if the URI must be shown as plain text.
 * Only http(s) and ipfs:// are allowed; this blocks javascript:, data:, etc.
 */
export const safeHref = (uri: string): string | null => {
  if (!uri) return null;
  try {
    if (uri.toLowerCase().startsWith("ipfs://")) {
      const gateway = new URL(`https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`);
      return gateway.hostname === "ipfs.io" ? gateway.href : null;
    }
    if (!/^https?:\/\//i.test(uri)) return null;
    const url = new URL(uri);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const isAllowedUri = (uri: string) => safeHref(uri.trim()) !== null;

/** keccak256 over the raw file bytes, computed locally. The file is never uploaded. */
export const hashFile = async (file: File) => keccak256(new Uint8Array(await file.arrayBuffer()));

export const formatCountdown = (secondsLeft: number) => {
  if (secondsLeft <= 0) return "0s";
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = Math.floor(secondsLeft % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;
