# Hash The Cash – Decentralized Club Treasury Escrow

> **VIBECHAIN – The Ultimate Blockchain Challenge | MERAZ 7.0 (DSC × BIB)**  
> **Track:** Trustworthy Club Treasury  
> **Network:** Ethereum Sepolia Testnet  
> **Contract Address:** [`0x595e83c384780506a12c2411ade4ad2ce337db26`](https://sepolia.etherscan.io/address/0x595e83c384780506a12c2411ade4ad2ce337db26#code) (Verified on Etherscan)  
> **Live Demo:** [Deploying to Vercel]

---

## 1. Project Overview

**Hash The Cash** is an on-chain, task-based treasury escrow application designed to eliminate trust deficits, opaque spending, and backdoor misuse in student clubs and decentralized teams.

Instead of club funds sitting in a personal UPI handle or centralized bank account where transactions are buried in private chats, **Hash The Cash enforces rules purely in immutable smart contract code**:
1. **Funds are locked per task** at creation time.
2. **Assignees submit cryptographic proof-of-work** (IPFS CID / Git commit URL + keccak256 content hash) directly on-chain.
3. **Instant automated payouts** occur upon leader approval.
4. **Anti-ghosting guarantee:** If the leader goes unresponsive, the teammate can self-claim their payout once the review window elapses.
5. **No rug-pulls / backdoors:** The leader cannot cancel a funded task once work has been submitted.

---

## 2. Problem Statement & Solution

### The Problem
In student communities and clubs:
- Funds sit in private accounts.
- Approvals happen in unstructured chats; receipts and deliverables get lost.
- Deployers/admins can drain shared treasuries without oversight.
- Work is completed, but teammates are ghosted or delayed indefinitely for reimbursements.

### The Solution
A trustless state machine governed by [`TaskEscrow.sol`](packages/hardhat/contracts/TaskEscrow.sol):
- **Explicit Accountability:** Outflows are bound 1-to-1 to verified work hashes and task IDs.
- **Safety Invariants:**
  - The contract never pays out more than held.
  - No authorization can move funds more than once (strict status transitions).
  - Rejected or expired proposals cannot trigger payments.
  - Direct/accidental ETH transfers without task registration revert.

---

## 3. Architecture & Workflow

### Task State Machine

```
               [ createTask ]
            (Funds locked in ETH)
                     │
                     ▼
                 Assigned
                     │
             [ submitWork ] (IPFS CID + keccak256 hash)
                     │
                     ▼
                 Submitted
                /    │    \
 [ approveAndPay ]   │   [ claimAfterReview ]
        │            │   (If leader silent > reviewPeriod)
        ▼            │            │
      Paid           │            ▼
                     │          Paid
                     ▼
               [ rejectWork ]
           (Only in review window;
          extends task deadline)
                     │
                     ▼
                 Assigned (Resubmit)
```

- **Expired Tasks:** If a task passes its deadline with *no submission*, the leader can recover the funds via `cancelExpired()`.

---

## 4. Smart Contract Specifications

- **Contract:** `TaskEscrow.sol`
- **Solidity Version:** `^0.8.24` (Compiled with `0.8.30`)
- **Key Security Measures:**
  - **Reentrancy Guard:** Custom reentrancy modifier on all value transfers.
  - **Checks-Effects-Interactions (CEI):** State is updated to `Paid` / `Cancelled` prior to external ETH calls.
  - **Strict Access Control:** Custom lightweight errors (`NotLeader`, `NotAssignee`, `NotMember`, `WrongStatus`, etc.) saving gas.
  - **Timelock Guarantees:** Teammate claim window (`claimAfterReview`) guarantees protection against silent leaders.

### Test Suite (24 / 24 Passing)
Comprehensive automated tests covering:
- Happy paths (creation, submission, approval, self-claim, rejection-resubmission flow).
- Attack vectors (reentrancy exploit test with `ReentrantMember.sol`, unauthorized callers, double-claim, double-pay, front-running cancellations).

---

## 5. Deployed Contract Information

| Property | Value |
|---|---|
| **Network** | Ethereum Sepolia (Chain ID: `11155111`) |
| **Contract Address** | `0x595e83c384780506a12c2411ade4ad2ce337db26` |
| **Etherscan Link** | [View on Sepolia Etherscan](https://sepolia.etherscan.io/address/0x595e83c384780506a12c2411ade4ad2ce337db26#code) |
| **Review Period** | 120 seconds (optimized for live hackathon testing) |

---

## 6. Setup & Local Development

### Prerequisites
- Node.js `>= 22.10`
- Yarn (`corepack enable`)
- MetaMask installed

### Running Frontend
```bash
git clone https://github.com/sarthak0707git/iloveblockchain.git
cd iloveblockchain/hash-the-cash
yarn install
yarn start
```
Visit `http://localhost:3000`.

### Running Smart Contract Tests
```bash
cd hash-the-cash
yarn hardhat:test
```

---

## 7. Justification of Design Choices

1. **Task Escrow vs General Multi-Sig:** Small teams and hackathon projects spend money on distinct deliverables. Locking funds per-task ensures funds are never commingled or spent on unauthorized items.
2. **On-Chain Keccak256 Verification:** Assignees submit a cryptographic hash of their delivery files. Anyone can verify deliverables on the frontend using client-side hashing without exposing private files beforehand.
3. **Automated Teammate Claiming:** Eliminates administrative bottlenecks; contributors are guaranteed payment if work was delivered before the deadline and not formally rejected.
