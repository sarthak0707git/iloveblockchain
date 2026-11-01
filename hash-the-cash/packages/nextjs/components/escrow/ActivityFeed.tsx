"use client";

import { useMemo } from "react";
import { NameTag } from "./NameTag";
import { SafeLink } from "./SafeLink";
import { formatEther } from "viem";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { shortHash } from "~~/utils/taskEscrow";

type Args = Record<string, unknown>;

type FeedItem = {
  key: string;
  eventName: string;
  args: Args;
  blockNumber: bigint;
  logIndex: number;
};

const describe = (eventName: string, args: Args) => {
  const id = args.id !== undefined ? `#${String(args.id)}` : "";

  switch (eventName) {
    case "MemberAdded":
      return (
        <>
          <NameTag address={args.member as string} /> joined the team
        </>
      );
    case "MemberRemoved":
      return (
        <>
          <NameTag address={args.member as string} /> was removed from the team
        </>
      );
    case "TaskCreated":
      return (
        <>
          Task {id} <b>{String(args.title ?? "")}</b> created for <NameTag address={args.assignee as string} /> ·{" "}
          <span className="font-mono">{formatEther((args.reward as bigint) ?? 0n)} ETH</span> locked
        </>
      );
    case "WorkSubmitted":
      return (
        <>
          <NameTag address={args.assignee as string} /> submitted work for task {id} ·{" "}
          <SafeLink uri={String(args.workURI ?? "")} /> ·{" "}
          <code className="font-mono text-xs">{shortHash(String(args.workHash ?? ""))}</code>
        </>
      );
    case "WorkRejected":
      return (
        <>
          Task {id} sent back for rework
          {args.reason ? <> — “{String(args.reason)}”</> : null}
        </>
      );
    case "TaskPaid":
      return (
        <>
          Task {id} paid <span className="font-mono">{formatEther((args.amount as bigint) ?? 0n)} ETH</span> to{" "}
          <NameTag address={args.assignee as string} />
        </>
      );
    case "TaskCancelled":
      return (
        <>
          Task {id} cancelled · <span className="font-mono">{formatEther((args.refund as bigint) ?? 0n)} ETH</span>{" "}
          refunded to the leader
        </>
      );
    default:
      return <>{eventName}</>;
  }
};

export const ActivityFeed = () => {
  // One subscription per event type; merged and sorted newest-first below.
  const memberAdded = useScaffoldEventHistory({ contractName: "TaskEscrow", eventName: "MemberAdded", watch: true });
  const memberRemoved = useScaffoldEventHistory({
    contractName: "TaskEscrow",
    eventName: "MemberRemoved",
    watch: true,
  });
  const taskCreated = useScaffoldEventHistory({ contractName: "TaskEscrow", eventName: "TaskCreated", watch: true });
  const workSubmitted = useScaffoldEventHistory({
    contractName: "TaskEscrow",
    eventName: "WorkSubmitted",
    watch: true,
  });
  const workRejected = useScaffoldEventHistory({ contractName: "TaskEscrow", eventName: "WorkRejected", watch: true });
  const taskPaid = useScaffoldEventHistory({ contractName: "TaskEscrow", eventName: "TaskPaid", watch: true });
  const taskCancelled = useScaffoldEventHistory({
    contractName: "TaskEscrow",
    eventName: "TaskCancelled",
    watch: true,
  });

  const sources = [memberAdded, memberRemoved, taskCreated, workSubmitted, workRejected, taskPaid, taskCancelled];
  const isLoading = sources.some(s => s.isLoading);

  // Each hook returns logs typed to its own event, so normalise before merging.
  const events = useMemo(() => {
    const toItems = (data: readonly unknown[] | undefined): FeedItem[] =>
      (data ?? []).map(raw => {
        const log = raw as {
          transactionHash?: string;
          logIndex?: number;
          eventName?: string;
          args?: Args;
          blockNumber?: bigint;
        };
        return {
          key: `${log.transactionHash}-${log.logIndex}`,
          eventName: String(log.eventName ?? ""),
          args: (log.args ?? {}) as Args,
          blockNumber: log.blockNumber ?? 0n,
          logIndex: Number(log.logIndex ?? 0),
        };
      });

    return [
      ...toItems(memberAdded.data),
      ...toItems(memberRemoved.data),
      ...toItems(taskCreated.data),
      ...toItems(workSubmitted.data),
      ...toItems(workRejected.data),
      ...toItems(taskPaid.data),
      ...toItems(taskCancelled.data),
    ].sort((a, b) => {
      const byBlock = Number(b.blockNumber - a.blockNumber);
      return byBlock !== 0 ? byBlock : b.logIndex - a.logIndex;
    });
  }, [
    memberAdded.data,
    memberRemoved.data,
    taskCreated.data,
    workSubmitted.data,
    workRejected.data,
    taskPaid.data,
    taskCancelled.data,
  ]);

  return (
    <section className="stock">
      <div className="p-5 flex flex-col gap-3">
        <h2 className="font-bold">Activity</h2>
        <p className="label-c">Every state change, read straight from contract events.</p>

        {isLoading && events.length === 0 ? (
          <span className="text-[var(--color-muted)]">Loading activity…</span>
        ) : events.length === 0 ? (
          <p className="text-[var(--color-muted)]">Nothing has happened on this contract yet.</p>
        ) : (
          <ol className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
            {events.map(e => (
              <li key={e.key} className="text-sm border-l border-[var(--color-rule-2)] pl-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{describe(e.eventName, e.args)}</div>
                <div className="label-c mt-0.5">block {String(e.blockNumber)}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
