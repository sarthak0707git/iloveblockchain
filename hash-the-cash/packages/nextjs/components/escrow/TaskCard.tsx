"use client";

import { useState } from "react";
import { FileHashInput } from "./FileHashInput";
import { NameTag } from "./NameTag";
import { SafeLink } from "./SafeLink";
import { formatEther } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useNow } from "~~/hooks/useEscrow";
import { STATUS, STATUS_LABEL, Task, ZERO_HASH, formatCountdown, isAllowedUri, shortHash } from "~~/utils/taskEscrow";

type Props = {
  task: Task & { id: bigint };
  reviewPeriod: number;
  isLeader: boolean;
  isAssignee: boolean;
  onDone: () => void;
};

export const TaskCard = ({ task, reviewPeriod, isLeader, isAssignee, onDone }: Props) => {
  const now = useNow();
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "TaskEscrow" });

  const [workURI, setWorkURI] = useState("");
  const [workHash, setWorkHash] = useState<`0x${string}` | "">("");
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const deadline = Number(task.deadline);
  const submittedAt = Number(task.submittedAt);
  const reviewEndsAt = submittedAt + reviewPeriod;

  const pastDeadline = now > deadline;
  const reviewOpen = task.status === STATUS.Submitted && now < reviewEndsAt;

  // The contract decides all of this too; these flags only keep the UI honest
  // about which buttons can possibly succeed right now.
  const canSubmit = isAssignee && task.status === STATUS.Assigned && !pastDeadline;
  const canClaim = isAssignee && task.status === STATUS.Submitted && !reviewOpen;
  const canApprove = isLeader && task.status === STATUS.Submitted;
  const canReject = isLeader && reviewOpen;
  const canCancel = isLeader && task.status === STATUS.Assigned && pastDeadline;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onDone();
    } catch {
      // useTransactor already surfaced the reason as a toast.
    }
  };

  const submitReady = workURI.trim().length > 0 && isAllowedUri(workURI) && !!workHash;

  return (
    <div className="stock stock--lift">
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="label-c">Task #{task.id.toString()}</div>
            <h3 className="font-bold break-words">{task.title || "(untitled)"}</h3>
          </div>
          {task.status === STATUS.Paid ? (
            // The one settled state, pressed into the sheet. Coral is spent here and nowhere else.
            <span className="pressed shrink-0 text-lg">paid</span>
          ) : (
            <span className={`mark shrink-0 ${task.status === STATUS.Submitted ? "mark--live" : ""}`}>
              {STATUS_LABEL[task.status]}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="label-c">Assignee</span>
            <NameTag address={task.assignee} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-c">Reward</span>
            <span className="font-mono font-semibold">{formatEther(task.reward)} ETH</span>
          </div>
        </div>

        {task.specURI ? (
          <div className="text-sm">
            <span className="label-c block">Spec</span>
            <SafeLink uri={task.specURI} />
          </div>
        ) : null}

        {task.workURI ? (
          <div className="text-sm">
            <span className="label-c block">Submitted work</span>
            <SafeLink uri={task.workURI} />
            {task.workHash && task.workHash !== ZERO_HASH ? (
              <div className="text-xs font-mono opacity-70 mt-1">{shortHash(task.workHash)}</div>
            ) : null}
          </div>
        ) : null}

        <div className="label-c">
          {task.status === STATUS.Assigned ? (
            pastDeadline ? (
              <>Deadline passed {formatCountdown(now - deadline)} ago.</>
            ) : (
              <>Due in {formatCountdown(deadline - now)}.</>
            )
          ) : null}
          {task.status === STATUS.Submitted ? (
            reviewOpen ? (
              <>Leader has {formatCountdown(reviewEndsAt - now)} left to review.</>
            ) : (
              <>Review window closed — the assignee can claim payment.</>
            )
          ) : null}
        </div>

        {canSubmit ? (
          <div className="flex flex-col gap-2 border-t border-[var(--color-rule)] pt-4">
            <input
              className="field-c"
              placeholder="Work link (https://… or ipfs://…)"
              value={workURI}
              onChange={e => setWorkURI(e.target.value)}
            />
            {workURI && !isAllowedUri(workURI) ? (
              <span className="text-sm text-[var(--color-error)]">Only http(s) and ipfs:// links are accepted.</span>
            ) : null}
            <FileHashInput value={workHash} onChange={setWorkHash} disabled={isMining} />
            <button
              className="btn-c btn-c--ink btn-c--sm"
              disabled={!submitReady || isMining}
              onClick={() =>
                run(() =>
                  writeContractAsync({
                    functionName: "submitWork",
                    args: [task.id, workURI.trim(), workHash as `0x${string}`],
                  }),
                )
              }
            >
              {isMining ? <span className="loading loading-spinner loading-xs" /> : null}
              Submit work
            </button>
          </div>
        ) : null}

        {(canClaim || canApprove || canReject || canCancel) && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-rule)] pt-4">
            {canApprove ? (
              <button
                className="btn-c btn-c--ink btn-c--sm"
                disabled={isMining}
                onClick={() => run(() => writeContractAsync({ functionName: "approveAndPay", args: [task.id] }))}
              >
                Approve &amp; pay
              </button>
            ) : null}
            {canReject ? (
              <button
                className="btn-c btn-c--card btn-c--sm"
                disabled={isMining}
                onClick={() => setShowReject(v => !v)}
              >
                Reject
              </button>
            ) : null}
            {canClaim ? (
              <button
                className="btn-c btn-c--ink btn-c--sm"
                disabled={isMining}
                onClick={() => run(() => writeContractAsync({ functionName: "claimAfterReview", args: [task.id] }))}
              >
                Claim payment
              </button>
            ) : null}
            {canCancel ? (
              <button
                className="btn-c btn-c--card btn-c--sm"
                disabled={isMining}
                onClick={() => run(() => writeContractAsync({ functionName: "cancelExpired", args: [task.id] }))}
              >
                Cancel &amp; refund
              </button>
            ) : null}
          </div>
        )}

        {canReject && showReject ? (
          <div className="flex flex-col gap-2">
            <input
              className="field-c"
              placeholder="Why is this being sent back?"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <button
              className="btn-c btn-c--card btn-c--sm"
              disabled={isMining}
              onClick={() =>
                run(async () => {
                  await writeContractAsync({ functionName: "rejectWork", args: [task.id, reason] });
                  setReason("");
                  setShowReject(false);
                })
              }
            >
              Send back for rework
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
