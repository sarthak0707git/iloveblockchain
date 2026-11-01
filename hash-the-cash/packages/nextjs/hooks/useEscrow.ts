import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { STATUS, Task } from "~~/utils/taskEscrow";

/** Wall-clock seconds, ticking every second, for countdowns. */
export const useNow = () => {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const useEscrow = () => {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: contract } = useDeployedContractInfo({ contractName: "TaskEscrow" });

  const { data: leader } = useScaffoldReadContract({ contractName: "TaskEscrow", functionName: "leader" });
  const { data: reviewPeriod } = useScaffoldReadContract({ contractName: "TaskEscrow", functionName: "reviewPeriod" });
  const { data: taskCount } = useScaffoldReadContract({ contractName: "TaskEscrow", functionName: "taskCount" });
  const { data: connectedIsMember } = useScaffoldReadContract({
    contractName: "TaskEscrow",
    functionName: "isMember",
    args: [address],
    query: { enabled: !!address },
  });

  const ids = useMemo(() => Array.from({ length: Number(taskCount ?? 0n) }, (_, i) => BigInt(i + 1)), [taskCount]);

  const { data: taskResults, refetch: refetchTasks } = useReadContracts({
    contracts: ids.map(id => ({
      address: contract?.address,
      abi: contract?.abi,
      functionName: "getTask",
      args: [id],
      chainId: targetNetwork.id,
    })),
    query: { enabled: !!contract && ids.length > 0, refetchInterval: 4000 },
  });

  const tasks = useMemo(
    () =>
      ids
        .map((id, i) => {
          const result = taskResults?.[i]?.result as Task | undefined;
          return result ? { id, ...result, status: Number(result.status) } : undefined;
        })
        .filter((t): t is Task & { id: bigint } => !!t),
    [ids, taskResults],
  );

  const totals = useMemo(() => {
    let locked = 0n;
    let paid = 0n;
    for (const t of tasks) {
      if (t.status === STATUS.Assigned || t.status === STATUS.Submitted) locked += t.reward;
      if (t.status === STATUS.Paid) paid += t.reward;
    }
    return { locked, paid };
  }, [tasks]);

  const isLeader = sameAddress(address, leader);
  const myTasks = tasks.filter(t => sameAddress(t.assignee, address));
  const isTeammate = !!connectedIsMember || myTasks.length > 0;
  const myEarned = myTasks.filter(t => t.status === STATUS.Paid).reduce((sum, t) => sum + t.reward, 0n);

  return {
    address,
    contract,
    leader,
    reviewPeriod: Number(reviewPeriod ?? 0n),
    tasks,
    totals,
    isLeader,
    isTeammate,
    myTasks,
    myEarned,
    refetchTasks,
    sameAddress,
  };
};

export type EscrowState = ReturnType<typeof useEscrow>;
