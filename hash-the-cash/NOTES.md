# Hash The Cash: Build Notes

## Task list
- [x] Phase 1: Scaffold (create-eth 2.0.23, Hardhat 3 + rocketh/hardhat-deploy v2)
- [x] Phase 2: `TaskEscrow.sol` copied verbatim from the handoff, plus deploy script
- [x] Phase 3: Tests (24 passing: happy paths, attacks, reentrancy)
- [x] Phase 4: Deployed + verified on Sepolia
- [x] Phase 5a: Functional frontend on Sepolia (`yarn start` → http://localhost:3000)
- [ ] Phase 5b: Visual polish (after the user confirms the MetaMask flow works)
- [ ] Phase 6: Demo rehearsal

## Environment
- Node 22.23.4 installed to `~/.local/node-v22` (scaffold requires Node >= 22.10; system Node is 18).
  Use it with: `export PATH=$HOME/.local/node-v22/bin:$PATH`
- Yarn 4.13.0 through corepack.

## Log
- Removed `YourContract.sol`, its deploy script and its test.
- `contracts/TaskEscrow.sol`: exact copy of the handoff contract. Compiles with zero warnings on solc 0.8.30
  (scaffold default; satisfies `^0.8.24`).
- `deploy/00_deploy_task_escrow.ts`: rocketh deploy, `args: [120n]` (2-minute review period), logs `leader()`.
- `contracts/test/ReentrantMember.sol`: attacker whose `receive()` re-enters `claimAfterReview` in try/catch.
- `test/TaskEscrow.ts`: run with `yarn hardhat:test`.
- Local deploy checked: `yarn chain` + `yarn deploy` → leader = deployer, `deployedContracts.ts` generated.

- Frontend: `scaffold.config.ts` → Sepolia only (burner wallet off). Dashboard in `app/page.tsx` +
  `components/escrow/*`, data in `hooks/useEscrow.ts`, helpers in `utils/taskEscrow.ts`.
  Custom errors are mapped to plain sentences inside `useTransactor` toasts. User strings are rendered as React
  text only (no `dangerouslySetInnerHTML`). Links go through `safeHref` (http/https/ipfs only; tested against
  `javascript:`, `data:`, mixed case, leading-space payloads). Files are hashed locally with keccak256.

- Fix: wallet modal crashed with `RangeError: invalid border=0`. RainbowKit's QR lib `cuer@0.0.3` passes
  `border: 0`, which `qr@0.7.x` rejects. Pinned `"cuer/qr": "0.5.5"` in root `package.json` resolutions.

## Test summary (24 passing)
Happy: lock on create, approve → instant pay, self-claim after silence, reject → extended deadline → resubmit → paid,
cancelExpired refund, removeMember keeps funded tasks payable.
Attacks: NotLeader (all leader fns), BadAddress (0x0, leader), NoReward / NotMember / BadDeadline,
NotAssignee (wrong submitter, id 999, wrong claimer), EmptyWork, DeadlinePassed, WrongStatus (double pay,
claim after pay, cancel after pay, double cancel, double submit, cancel while Submitted), DeadlineNotPassed,
ReviewWindowOpen, ReviewWindowClosed, plain ETH transfer reverts, BadReviewPeriod (0 and > 30 days),
reentrancy (paid once, re-entry reverts with `Reentrancy`, task balance 0).

## Deployment
- Network: Sepolia
- Address: `0x595e83c384780506a12c2411ade4ad2ce337db26`
- Etherscan (verified): https://sepolia.etherscan.io/address/0x595e83c384780506a12c2411ade4ad2ce337db26#code
- Deploy tx: https://sepolia.etherscan.io/tx/0xdc84a81fbbae1d0d5653e7b634e943df9454388f9885be486790be80d844519c
- leader(): `0x6d24Eb6a3FD6efb062625e4263Cd1438dB57fbec` (read back on-chain; must match MetaMask "Leader")
- reviewPeriod(): 120 s, taskCount(): 0 at deploy
