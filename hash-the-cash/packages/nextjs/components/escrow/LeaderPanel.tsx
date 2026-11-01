"use client";

import { useMemo, useState } from "react";
import { NameTag } from "./NameTag";
import { AddressInput, EtherInput } from "@scaffold-ui/components";
import { parseEther } from "viem";
import { useScaffoldEventHistory, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { type EscrowState, useNow } from "~~/hooks/useEscrow";
import { isAllowedUri } from "~~/utils/taskEscrow";

/** Replays MemberAdded / MemberRemoved to get the current member set. */
const useMembers = () => {
  const { data: added, isLoading: loadingAdded } = useScaffoldEventHistory({
    contractName: "TaskEscrow",
    eventName: "MemberAdded",
    watch: true,
  });
  const { data: removed, isLoading: loadingRemoved } = useScaffoldEventHistory({
    contractName: "TaskEscrow",
    eventName: "MemberRemoved",
    watch: true,
  });

  const members = useMemo(() => {
    const seen = new Map<string, boolean>();
    const events = [...(added ?? []), ...(removed ?? [])].sort((a, b) => {
      const byBlock = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
      return byBlock !== 0 ? byBlock : Number((a.logIndex ?? 0) - (b.logIndex ?? 0));
    });
    for (const e of events) {
      const member = (e.args as { member?: string }).member;
      if (!member) continue;
      seen.set(member.toLowerCase(), e.eventName === "MemberAdded");
    }
    return [...seen.entries()].filter(([, active]) => active).map(([addr]) => addr);
  }, [added, removed]);

  return { members, isLoading: loadingAdded || loadingRemoved };
};

export const LeaderPanel = ({ escrow }: { escrow: EscrowState }) => {
  const now = useNow();
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "TaskEscrow" });
  const { members, isLoading } = useMembers();

  const [newMember, setNewMember] = useState("");
  const [title, setTitle] = useState("");
  const [specURI, setSpecURI] = useState("");
  const [assignee, setAssignee] = useState("");
  const [reward, setReward] = useState("");
  const [deadline, setDeadline] = useState("");

  const deadlineSeconds = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;
  const deadlineValid = deadlineSeconds > now;
  const rewardValid = (() => {
    try {
      return !!reward && parseEther(reward) > 0n;
    } catch {
      return false;
    }
  })();
  const specValid = !specURI || isAllowedUri(specURI);
  const createReady = !!title.trim() && !!assignee && rewardValid && deadlineValid && specValid;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      escrow.refetchTasks();
    } catch {
      // useTransactor already surfaced the reason as a toast.
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Leader panel</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="stock">
          <div className="p-5 flex flex-col gap-3">
            <h3 className="font-semibold">Team members</h3>

            {isLoading ? (
              <span className="text-[var(--color-muted)]">Loading members…</span>
            ) : members.length === 0 ? (
              <p className="text-[var(--color-muted)]">No members yet. Add one before creating a task.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {members.map(m => (
                  <li key={m} className="flex items-center justify-between gap-2">
                    <NameTag address={m} />
                    <button
                      className="btn-c btn-c--card btn-c--sm"
                      disabled={isMining}
                      onClick={() => run(() => writeContractAsync({ functionName: "removeMember", args: [m] }))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2 border-t border-[var(--color-rule)] pt-4">
              <AddressInput value={newMember} onChange={setNewMember} placeholder="Address or ENS name" />
              <button
                className="btn-c btn-c--ink btn-c--sm"
                disabled={!newMember || isMining}
                onClick={() =>
                  run(async () => {
                    await writeContractAsync({ functionName: "addMember", args: [newMember] });
                    setNewMember("");
                  })
                }
              >
                Add member
              </button>
            </div>
          </div>
        </div>

        <div className="stock">
          <div className="p-5 flex flex-col gap-3">
            <h3 className="font-semibold">Create a task</h3>
            <p className="label-c">The reward leaves your wallet now and is locked in the contract.</p>

            <input className="field-c" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <input
              className="field-c"
              placeholder="Spec link (optional, https:// or ipfs://)"
              value={specURI}
              onChange={e => setSpecURI(e.target.value)}
            />
            {!specValid ? (
              <span className="text-sm text-[var(--color-error)]">Only http(s) and ipfs:// links are accepted.</span>
            ) : null}

            <AddressInput value={assignee} onChange={setAssignee} placeholder="Assignee (must be a member)" />
            <EtherInput placeholder="Reward" onValueChange={v => setReward(v.valueInEth)} />

            <label className="flex flex-col gap-1">
              <span className="label-c">Submission deadline</span>
              <input
                type="datetime-local"
                className="field-c"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
              />
            </label>
            {deadline && !deadlineValid ? (
              <span className="text-sm text-[var(--color-error)]">The deadline has to be in the future.</span>
            ) : null}

            <button
              className="btn-c btn-c--ink btn-c--sm"
              disabled={!createReady || isMining}
              onClick={() =>
                run(async () => {
                  await writeContractAsync({
                    functionName: "createTask",
                    args: [title.trim(), specURI.trim(), assignee, BigInt(deadlineSeconds)],
                    value: parseEther(reward),
                  });
                  setTitle("");
                  setSpecURI("");
                  setAssignee("");
                  setReward("");
                  setDeadline("");
                })
              }
            >
              {isMining ? <span className="loading loading-spinner loading-xs" /> : null}
              Create task &amp; lock reward
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
