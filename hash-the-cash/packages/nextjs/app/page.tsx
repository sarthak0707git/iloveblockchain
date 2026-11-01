"use client";

import type { NextPage } from "next";
import { formatEther } from "viem";
import { ActivityFeed } from "~~/components/escrow/ActivityFeed";
import { LeaderPanel } from "~~/components/escrow/LeaderPanel";
import { NameTag } from "~~/components/escrow/NameTag";
import { NetworkGuard } from "~~/components/escrow/NetworkGuard";
import { TaskCard } from "~~/components/escrow/TaskCard";
import { VerifyWork } from "~~/components/escrow/VerifyWork";
import { useEscrow } from "~~/hooks/useEscrow";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="label-c">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

const Home: NextPage = () => {
  const escrow = useEscrow();
  const { tasks, isLeader, isTeammate, myTasks, myEarned, address, reviewPeriod, refetchTasks } = escrow;

  return (
    <div className="desk min-h-screen">
      <div className="container flex flex-col gap-10 py-10">
        <NetworkGuard />

        {/* The board: the one figure that matters, set huge, beside what it pays for. */}
        <section className="board p-7 sm:p-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-end">
          <div className="flex flex-col gap-3 min-w-0">
            <h1 className="text-[var(--color-board-type)]">Money that only moves when the work lands.</h1>
            <p className="lead text-[var(--color-board-type)] opacity-80">
              Rewards sit in the contract, not with anyone. Approval pays instantly; silence pays the teammate anyway.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="label-c text-[var(--color-board-type)] opacity-70">Locked in escrow</span>
              <div className="flex items-baseline gap-2">
                <span
                  className="fig text-[var(--color-board-type)] leading-[0.85]"
                  style={{ fontSize: "clamp(2.75rem, 7vw, 4.5rem)", letterSpacing: "-0.05em" }}
                >
                  {formatEther(escrow.totals.locked)}
                </span>
                <span className="text-[var(--color-board-type)] opacity-70 font-medium">ETH</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label-c text-[var(--color-board-type)] opacity-70">Paid out so far</span>
              <span className="fig text-2xl text-[var(--color-board-type)]">{formatEther(escrow.totals.paid)} ETH</span>
            </div>
          </div>
        </section>

        {/* The record sheet: who the parties are, on cotton laid under the board. */}
        <section className="stock p-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Contract">{escrow.contract ? <NameTag address={escrow.contract.address} /> : "…"}</Field>
          <Field label="Team leader">{escrow.leader ? <NameTag address={escrow.leader} /> : "…"}</Field>
          <Field label="Review window">
            <span className="fig">{reviewPeriod}s</span>{" "}
            <span className="text-[var(--color-muted)]">before a teammate can self-claim</span>
          </Field>
        </section>

        {address && (
          <p className="text-[var(--color-muted)]">
            You are here as{" "}
            <span className="font-medium text-[var(--color-ink)]">
              {isLeader ? "the team leader" : isTeammate ? "a teammate" : "a visitor"}
            </span>
            {isTeammate && !isLeader && (
              <>
                , earning <span className="fig text-[var(--color-ink)]">{formatEther(myEarned)} ETH</span> so far
              </>
            )}
            .
          </p>
        )}

        {isLeader && <LeaderPanel escrow={escrow} />}

        {isTeammate && !isLeader && (
          <section className="flex flex-col gap-4">
            <h2>Your tasks</h2>
            {myTasks.length === 0 ? (
              <p className="text-[var(--color-muted)]">Nothing is assigned to you yet.</p>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {myTasks.map(t => (
                  <TaskCard
                    key={t.id.toString()}
                    task={t}
                    reviewPeriod={reviewPeriod}
                    isLeader={false}
                    isAssignee
                    onDone={refetchTasks}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
          <section className="flex flex-col gap-4 min-w-0">
            <h2>The board</h2>
            {tasks.length === 0 ? (
              <p className="text-[var(--color-muted)]">No tasks have been created yet.</p>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {[...tasks].reverse().map(t => (
                  <TaskCard
                    key={t.id.toString()}
                    task={t}
                    reviewPeriod={reviewPeriod}
                    isLeader={isLeader}
                    // Teammate actions live under "Your tasks"; the board stays read-only for them.
                    isAssignee={false}
                    onDone={refetchTasks}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="flex flex-col gap-6 min-w-0">
            <VerifyWork tasks={tasks} />
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
