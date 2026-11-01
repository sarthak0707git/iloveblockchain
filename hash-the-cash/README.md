# Hash The Cash

On-chain task escrow for small teams. A team leader locks ETH as a task's reward, a teammate submits work (a link plus a keccak256 hash of the file), and the contract pays out on approval. If the leader doesn't review within the review window, the teammate can claim the reward themselves.

Built on [Scaffold-ETH 2](https://scaffoldeth.io) (Hardhat + Next.js + RainbowKit + wagmi + DaisyUI).

- **Network:** Sepolia testnet
- **Contract:** [`0x595e83c384780506a12c2411ade4ad2ce337db26`](https://sepolia.etherscan.io/address/0x595e83c384780506a12c2411ade4ad2ce337db26#code) (verified)
- **Leader:** `0x6d24Eb6a3FD6efb062625e4263Cd1438dB57fbec`
- **Review period:** 120 seconds

## Quick start (frontend only)

The contract is already deployed, so frontend work needs no blockchain setup.

**Requirements**
- Node.js **>= 22.10** (`node -v` to check)
- Yarn via corepack: `corepack enable`
- [MetaMask](https://metamask.io) browser extension on the **Sepolia** network, with some Sepolia test ETH from a faucet

```bash
git clone https://github.com/sarthak0707git/VibeChain-hashthecash.git
cd VibeChain-hashthecash
yarn install
yarn start
```

Open http://localhost:3000 and connect MetaMask. The page changes depending on the connected address:

| Connected as | What you see |
|---|---|
| Leader | Leader panel: add/remove members, create tasks, approve / reject / cancel |
| Member | "My tasks": submit work, claim payment after the review window |
| Anyone else | Read-only task board, activity feed, "Verify work" |

To test the leader and member views, ask the team to add your address as a member.

## Where the frontend lives

All app code is in `packages/nextjs`:

| Path | What it does |
|---|---|
| `app/page.tsx` | Main dashboard layout |
| `components/escrow/LeaderPanel.tsx` | Members list and the "create task" form |
| `components/escrow/TaskCard.tsx` | One task card with leader and assignee actions |
| `components/escrow/VerifyWork.tsx` | Drop a file and compare its hash to the on-chain hash |
| `components/escrow/ActivityFeed.tsx` | Contract event history |
| `components/escrow/NameTag.tsx` + `utils/names.ts` | Shows names instead of raw addresses. **Add teammates here.** |
| `hooks/useEscrow.ts` | Reads all contract state (tasks, leader, totals) |
| `utils/taskEscrow.ts` | Status labels, formatting, safe URL checks |
| `contracts/deployedContracts.ts` | Auto-generated ABI and address. Don't edit by hand. |

Styling uses Tailwind + DaisyUI classes. Theme config is in `styles/globals.css`.

**Rules to keep:**
- Use the Scaffold-ETH hooks in `hooks/scaffold-eth` (`useScaffoldReadContract`, `useScaffoldWriteContract`) for contract calls.
- Render user-provided strings (titles, links, reasons) as plain React text. Never use `dangerouslySetInnerHTML`.
- Links go through `SafeLink` / `isAllowedUri` (http, https and ipfs only).

## Task lifecycle

```
createTask (leader locks ETH)
   └─> Assigned ──submitWork──> Submitted ──approveAndPay──> Paid
          │                        │
          │                        ├─rejectWork──> Assigned (new deadline, resubmit)
          │                        └─review window passes──> claimAfterReview ──> Paid
          └─deadline passes──> cancelExpired ──> Cancelled (ETH refunded to leader)
```

**Gas** is paid by whoever sends a transaction: the leader for add member, create task, approve, reject and cancel; the teammate for submit work and claim. The reward itself comes out of escrow.

## Contract work (optional)

```bash
yarn compile          # compile contracts
yarn hardhat:test     # run the 24 contract tests
yarn chain            # local blockchain (terminal 1)
yarn deploy           # deploy locally (terminal 2), regenerates deployedContracts.ts
```

The contract is `packages/hardhat/contracts/TaskEscrow.sol`. Redeploying to Sepolia creates a **new address** with a fresh leader. Only do that on purpose.

## Troubleshooting

- **MetaMask popup doesn't open:** use the browser extension on desktop, unlock it first, and disable other wallet extensions (Rabby, Coinbase). The WalletConnect/QR flow to a phone is unreliable and can fail with "Request expired".
- **Wrong network banner:** switch MetaMask to Sepolia.
- **Fallback:** every contract function can be called by hand on [Etherscan → Write Contract](https://sepolia.etherscan.io/address/0x595e83c384780506a12c2411ade4ad2ce337db26#writeContract).
