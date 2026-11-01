import { deployScript, artifacts } from "../rocketh/deploy.js";

/**
 * Deploys TaskEscrow. The deployer becomes the immutable `leader`, so on Sepolia the
 * deployer key must be the same account the leader uses in MetaMask.
 *
 * @param env Rocketh environment object.
 */
export default deployScript(
  async env => {
    const { deployer } = env.namedAccounts;

    const taskEscrow = await env.deploy("TaskEscrow", {
      account: deployer,
      artifact: artifacts.TaskEscrow,
      // 2-minute review period so the self-claim path is demo-able
      args: [120n],
    });

    const leader = await env.read(taskEscrow, { functionName: "leader" });
    console.log("👑 TaskEscrow leader:", leader);
  },
  {
    tags: ["TaskEscrow"],
  },
);
