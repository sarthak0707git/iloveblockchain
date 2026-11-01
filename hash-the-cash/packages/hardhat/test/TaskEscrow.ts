import { expect } from "chai";
import { network } from "hardhat";

const { networkHelpers, ethers } = await network.create();
const { time, loadFixture } = networkHelpers;

const REVIEW = 120;
const REWARD = ethers.parseEther("0.01");
const SPEC = "ipfs://bafyspec";
const WORK = "https://github.com/team/repo/commit/abc123";
const HASH = ethers.keccak256(ethers.toUtf8Bytes("landing-page.zip contents"));

enum Status {
  None,
  Assigned,
  Submitted,
  Paid,
  Cancelled,
}

async function deployFixture() {
  const [leader, alice, bob, mallory] = await ethers.getSigners();
  const escrow = await ethers.deployContract("TaskEscrow", [REVIEW], leader);
  await escrow.waitForDeployment();
  return { escrow, leader, alice, bob, mallory };
}

// Alice is a member and task #1 (0.01 ETH, deadline +1h) is assigned to her.
async function taskFixture() {
  const base = await deployFixture();
  const { escrow, alice } = base;
  await escrow.addMember(alice.address);
  const deadline = (await time.latest()) + 3600;
  await escrow.createTask("Design landing page", SPEC, alice.address, deadline, { value: REWARD });
  return { ...base, deadline };
}

async function submittedFixture() {
  const base = await taskFixture();
  await base.escrow.connect(base.alice).submitWork(1, WORK, HASH);
  return base;
}

describe("TaskEscrow", function () {
  describe("Deployment", function () {
    it("sets leader and review period", async function () {
      const { escrow, leader } = await loadFixture(deployFixture);
      expect(await escrow.leader()).to.equal(leader.address);
      expect(await escrow.reviewPeriod()).to.equal(REVIEW);
    });

    it("rejects a 0 or > 30 day review period", async function () {
      const { escrow } = await loadFixture(deployFixture);
      const factory = await ethers.getContractFactory("TaskEscrow");
      await expect(factory.deploy(0)).to.be.revertedWithCustomError(escrow, "BadReviewPeriod");
      await expect(factory.deploy(30 * 24 * 3600 + 1)).to.be.revertedWithCustomError(escrow, "BadReviewPeriod");
      await expect(factory.deploy(30 * 24 * 3600)).not.to.revert(ethers);
    });
  });

  describe("Happy paths", function () {
    it("locks the reward in the contract on createTask", async function () {
      const { escrow, alice } = await loadFixture(deployFixture);
      await expect(escrow.addMember(alice.address)).to.emit(escrow, "MemberAdded").withArgs(alice.address);
      const deadline = (await time.latest()) + 3600;
      await expect(
        escrow.createTask("Design landing page", SPEC, alice.address, deadline, { value: REWARD }),
      ).to.changeEtherBalance(ethers, escrow, REWARD);

      const t = await escrow.getTask(1);
      expect(t.assignee).to.equal(alice.address);
      expect(t.reward).to.equal(REWARD);
      expect(t.status).to.equal(Status.Assigned);
      expect(await escrow.taskCount()).to.equal(1);
    });

    it("pays alice instantly on approveAndPay", async function () {
      const { escrow, alice } = await loadFixture(taskFixture);
      await expect(escrow.connect(alice).submitWork(1, WORK, HASH))
        .to.emit(escrow, "WorkSubmitted")
        .withArgs(1, alice.address, WORK, HASH);

      const t = await escrow.getTask(1);
      expect(t.status).to.equal(Status.Submitted);
      expect(t.workURI).to.equal(WORK);
      expect(t.workHash).to.equal(HASH);

      const tx = escrow.approveAndPay(1);
      await expect(tx).to.changeEtherBalances(ethers, [alice, escrow], [REWARD, -REWARD]);
      await expect(tx).to.emit(escrow, "TaskPaid").withArgs(1, alice.address, REWARD);
      expect((await escrow.getTask(1)).status).to.equal(Status.Paid);
    });

    it("lets alice self-claim after the leader stays silent", async function () {
      const { escrow, alice } = await loadFixture(submittedFixture);
      await time.increase(REVIEW + 1);
      await expect(escrow.connect(alice).claimAfterReview(1)).to.changeEtherBalance(ethers, alice, REWARD);
      expect((await escrow.getTask(1)).status).to.equal(Status.Paid);
    });

    it("reject inside window → back to Assigned, deadline extended → resubmit → paid", async function () {
      const { escrow, alice, deadline } = await loadFixture(taskFixture);
      // Submit close to the original deadline so the extension is observable.
      await time.increaseTo(deadline - 30);
      await escrow.connect(alice).submitWork(1, WORK, HASH);

      const tx = escrow.rejectWork(1, "colors are off");
      await expect(tx).to.emit(escrow, "WorkRejected");
      const t = await escrow.getTask(1);
      expect(t.status).to.equal(Status.Assigned);
      expect(t.deadline).to.be.greaterThan(BigInt(deadline));
      expect(t.deadline).to.be.at.least(BigInt(await time.latest()) + BigInt(REVIEW));

      // Original deadline has now passed, but the extended one has not.
      await time.increaseTo(deadline + 10);
      const fixed = ethers.keccak256(ethers.toUtf8Bytes("landing-page-v2.zip"));
      await escrow.connect(alice).submitWork(1, WORK + "-v2", fixed);
      await expect(escrow.approveAndPay(1)).to.changeEtherBalance(ethers, alice, REWARD);
      expect((await escrow.getTask(1)).workHash).to.equal(fixed);
    });

    it("refunds the leader with cancelExpired when nothing was submitted", async function () {
      const { escrow, leader, deadline } = await loadFixture(taskFixture);
      await time.increaseTo(deadline + 1);
      const tx = escrow.cancelExpired(1);
      await expect(tx).to.changeEtherBalances(ethers, [leader, escrow], [REWARD, -REWARD]);
      await expect(tx).to.emit(escrow, "TaskCancelled").withArgs(1, REWARD);
      expect((await escrow.getTask(1)).status).to.equal(Status.Cancelled);
    });

    it("removeMember blocks new tasks but keeps funded ones payable", async function () {
      const { escrow, alice, deadline } = await loadFixture(taskFixture);
      await escrow.removeMember(alice.address);
      expect(await escrow.isMember(alice.address)).to.equal(false);
      await expect(
        escrow.createTask("t2", SPEC, alice.address, deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(escrow, "NotMember");
      await escrow.connect(alice).submitWork(1, WORK, HASH);
      await expect(escrow.approveAndPay(1)).to.changeEtherBalance(ethers, alice, REWARD);
    });
  });

  describe("Attacks", function () {
    it("non-leader cannot call leader functions → NotLeader", async function () {
      const { escrow, alice, mallory, deadline } = await loadFixture(submittedFixture);
      const m = escrow.connect(mallory);
      await expect(m.addMember(mallory.address)).to.be.revertedWithCustomError(escrow, "NotLeader");
      await expect(m.removeMember(alice.address)).to.be.revertedWithCustomError(escrow, "NotLeader");
      await expect(m.createTask("x", SPEC, alice.address, deadline, { value: REWARD })).to.be.revertedWithCustomError(
        escrow,
        "NotLeader",
      );
      await expect(m.approveAndPay(1)).to.be.revertedWithCustomError(escrow, "NotLeader");
      await expect(m.rejectWork(1, "no")).to.be.revertedWithCustomError(escrow, "NotLeader");
      await expect(m.cancelExpired(1)).to.be.revertedWithCustomError(escrow, "NotLeader");
      // The assignee is not the leader either.
      await expect(escrow.connect(alice).approveAndPay(1)).to.be.revertedWithCustomError(escrow, "NotLeader");
    });

    it("addMember(0x0) and addMember(leader) → BadAddress", async function () {
      const { escrow, leader } = await loadFixture(deployFixture);
      await expect(escrow.addMember(ethers.ZeroAddress)).to.be.revertedWithCustomError(escrow, "BadAddress");
      await expect(escrow.addMember(leader.address)).to.be.revertedWithCustomError(escrow, "BadAddress");
    });

    it("createTask input validation → NoReward / NotMember / BadDeadline", async function () {
      const { escrow, alice, bob } = await loadFixture(taskFixture);
      const future = (await time.latest()) + 3600;
      await expect(escrow.createTask("x", SPEC, alice.address, future)).to.be.revertedWithCustomError(
        escrow,
        "NoReward",
      );
      await expect(escrow.createTask("x", SPEC, bob.address, future, { value: REWARD })).to.be.revertedWithCustomError(
        escrow,
        "NotMember",
      );
      const past = (await time.latest()) - 1;
      await expect(escrow.createTask("x", SPEC, alice.address, past, { value: REWARD })).to.be.revertedWithCustomError(
        escrow,
        "BadDeadline",
      );
    });

    it("wrong submitter or unknown task id → NotAssignee", async function () {
      const { escrow, bob, alice, mallory } = await loadFixture(taskFixture);
      await expect(escrow.connect(bob).submitWork(1, WORK, HASH)).to.be.revertedWithCustomError(escrow, "NotAssignee");
      await expect(escrow.connect(alice).submitWork(999, WORK, HASH)).to.be.revertedWithCustomError(
        escrow,
        "NotAssignee",
      );
      await expect(escrow.connect(mallory).submitWork(999, WORK, HASH)).to.be.revertedWithCustomError(
        escrow,
        "NotAssignee",
      );
    });

    it("empty URI or zero hash → EmptyWork", async function () {
      const { escrow, alice } = await loadFixture(taskFixture);
      await expect(escrow.connect(alice).submitWork(1, "", HASH)).to.be.revertedWithCustomError(escrow, "EmptyWork");
      await expect(escrow.connect(alice).submitWork(1, WORK, ethers.ZeroHash)).to.be.revertedWithCustomError(
        escrow,
        "EmptyWork",
      );
    });

    it("submit after deadline → DeadlinePassed", async function () {
      const { escrow, alice, deadline } = await loadFixture(taskFixture);
      await time.increaseTo(deadline + 1);
      await expect(escrow.connect(alice).submitWork(1, WORK, HASH)).to.be.revertedWithCustomError(
        escrow,
        "DeadlinePassed",
      );
    });

    it("no double pay / refund → WrongStatus", async function () {
      const { escrow, alice, deadline } = await loadFixture(submittedFixture);
      await escrow.approveAndPay(1);
      await expect(escrow.approveAndPay(1)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await time.increase(REVIEW + 1);
      await expect(escrow.connect(alice).claimAfterReview(1)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await time.increaseTo(deadline + 1);
      await expect(escrow.cancelExpired(1)).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await expect(escrow.rejectWork(1, "late")).to.be.revertedWithCustomError(escrow, "WrongStatus");
      await expect(escrow.connect(alice).submitWork(1, WORK, HASH)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus",
      );
      expect(await ethers.provider.getBalance(escrow)).to.equal(0n);
    });

    it("no double submit while under review → WrongStatus", async function () {
      const { escrow, alice } = await loadFixture(submittedFixture);
      await expect(escrow.connect(alice).submitWork(1, WORK, HASH)).to.be.revertedWithCustomError(
        escrow,
        "WrongStatus",
      );
    });

    it("cancel after a cancel → WrongStatus (no double refund)", async function () {
      const { escrow, deadline } = await loadFixture(taskFixture);
      await time.increaseTo(deadline + 1);
      await escrow.cancelExpired(1);
      await expect(escrow.cancelExpired(1)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });

    it("leader cannot refund a submitted task (no front-run) → WrongStatus", async function () {
      const { escrow, deadline } = await loadFixture(submittedFixture);
      await time.increaseTo(deadline + 1);
      await expect(escrow.cancelExpired(1)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });

    it("leader cannot cancel before the deadline → DeadlineNotPassed", async function () {
      const { escrow } = await loadFixture(taskFixture);
      await expect(escrow.cancelExpired(1)).to.be.revertedWithCustomError(escrow, "DeadlineNotPassed");
    });

    it("claim before the review window ends → ReviewWindowOpen", async function () {
      const { escrow, alice } = await loadFixture(submittedFixture);
      await expect(escrow.connect(alice).claimAfterReview(1)).to.be.revertedWithCustomError(escrow, "ReviewWindowOpen");
    });

    it("only the assignee can self-claim → NotAssignee", async function () {
      const { escrow, mallory } = await loadFixture(submittedFixture);
      await time.increase(REVIEW + 1);
      await expect(escrow.connect(mallory).claimAfterReview(1)).to.be.revertedWithCustomError(escrow, "NotAssignee");
    });

    it("reject after the review window → ReviewWindowClosed", async function () {
      const { escrow } = await loadFixture(submittedFixture);
      await time.increase(REVIEW);
      await expect(escrow.rejectWork(1, "too late")).to.be.revertedWithCustomError(escrow, "ReviewWindowClosed");
    });

    it("plain ETH transfers to the contract revert", async function () {
      const { escrow, mallory } = await loadFixture(deployFixture);
      await expect(mallory.sendTransaction({ to: await escrow.getAddress(), value: 1n })).to.revert(ethers);
      await expect(mallory.sendTransaction({ to: await escrow.getAddress(), value: 1n, data: "0x12345678" })).to.revert(
        ethers,
      );
    });

    it("reentrant member is paid exactly once; re-entry fails with Reentrancy", async function () {
      const { escrow } = await loadFixture(deployFixture);
      const attacker = await ethers.deployContract("ReentrantMember", [await escrow.getAddress()]);
      const attackerAddr = await attacker.getAddress();

      await escrow.addMember(attackerAddr);
      const deadline = (await time.latest()) + 3600;
      await escrow.createTask("bait", SPEC, attackerAddr, deadline, { value: REWARD });
      // A second funded task keeps ETH in the contract, so a successful re-entry would have something to steal.
      const [, alice] = await ethers.getSigners();
      await escrow.addMember(alice.address);
      await escrow.createTask("other", SPEC, alice.address, deadline, { value: REWARD });

      await attacker.submit(1, WORK, HASH);
      await time.increase(REVIEW + 1);
      await expect(attacker.claim(1)).to.changeEtherBalances(ethers, [attacker, escrow], [REWARD, -REWARD]);

      expect(await attacker.timesPaid()).to.equal(1n);
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentrySucceeded()).to.equal(false);
      expect(await attacker.reentryError()).to.equal(escrow.interface.getError("Reentrancy")!.selector);
      expect((await escrow.getTask(1)).status).to.equal(Status.Paid);
      // Only alice's untouched reward remains: task 1's share is 0.
      expect(await ethers.provider.getBalance(escrow)).to.equal(REWARD);
    });
  });
});
