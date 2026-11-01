// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TaskEscrow
/// @notice A team leader escrows ETH per task. The assigned teammate submits
///         proof of work (IPFS CID / commit URL + content hash) on-chain and is
///         paid the moment the leader approves. If the leader never reviews,
///         the teammate can self-claim after the review period.
/// @dev Security notes (for the red-team round):
///      - Funds are locked at task creation (msg.value), never pulled later.
///      - Checks-Effects-Interactions + a reentrancy lock on every ETH transfer.
///      - Status machine prevents double payment / double refund.
///      - Leader cannot cancel once work is submitted (no front-run refund).
///      - Leader cannot sit on a submission forever (claimAfterReview).
///      - Rejection only inside the review window, and it extends the deadline
///        so the teammate can resubmit.
///      - No receive()/fallback(): stray ETH is rejected; accounting never
///        relies on address(this).balance, so forced ETH changes nothing.
///      - Trust assumption: the leader judges quality and may keep rejecting.
contract TaskEscrow {
    enum Status { None, Assigned, Submitted, Paid, Cancelled }

    struct Task {
        address assignee;
        uint256 reward;
        uint64 deadline;     // last second work can be submitted
        uint64 submittedAt;
        Status status;
        string title;
        string specURI;      // task description (IPFS / URL)
        string workURI;      // proof of work (IPFS CID / repo commit URL)
        bytes32 workHash;    // keccak256 of the delivered file(s)
    }

    address public immutable leader;
    uint64 public immutable reviewPeriod; // seconds the leader has to review

    mapping(address => bool) public isMember;
    mapping(uint256 => Task) private tasks;
    uint256 public taskCount;

    bool private locked;

    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event TaskCreated(uint256 indexed id, address indexed assignee, uint256 reward, uint64 deadline, string title);
    event WorkSubmitted(uint256 indexed id, address indexed assignee, string workURI, bytes32 workHash);
    event WorkRejected(uint256 indexed id, string reason, uint64 newDeadline);
    event TaskPaid(uint256 indexed id, address indexed assignee, uint256 amount);
    event TaskCancelled(uint256 indexed id, uint256 refund);

    error NotLeader();
    error NotAssignee();
    error NotMember();
    error BadAddress();
    error BadDeadline();
    error BadReviewPeriod();
    error NoReward();
    error EmptyWork();
    error WrongStatus();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error ReviewWindowOpen();
    error ReviewWindowClosed();
    error TransferFailed();
    error Reentrancy();

    modifier onlyLeader() {
        if (msg.sender != leader) revert NotLeader();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    /// @param _reviewPeriod e.g. 120 (2 min) for the demo, 3 days for real use
    constructor(uint64 _reviewPeriod) {
        if (_reviewPeriod == 0 || _reviewPeriod > 30 days) revert BadReviewPeriod();
        leader = msg.sender;
        reviewPeriod = _reviewPeriod;
    }

    // ---------------------------------------------------------------- team

    function addMember(address member) external onlyLeader {
        if (member == address(0) || member == leader) revert BadAddress();
        isMember[member] = true;
        emit MemberAdded(member);
    }

    /// @dev Removing a member does not touch tasks already funded for them.
    function removeMember(address member) external onlyLeader {
        isMember[member] = false;
        emit MemberRemoved(member);
    }

    // --------------------------------------------------------------- tasks

    /// @notice Leader creates a task and locks the reward in the same tx.
    function createTask(
        string calldata title,
        string calldata specURI,
        address assignee,
        uint64 deadline
    ) external payable onlyLeader returns (uint256 id) {
        if (msg.value == 0) revert NoReward();
        if (!isMember[assignee]) revert NotMember();
        if (deadline <= block.timestamp) revert BadDeadline();

        id = ++taskCount;
        Task storage t = tasks[id];
        t.assignee = assignee;
        t.reward = msg.value;
        t.deadline = deadline;
        t.status = Status.Assigned;
        t.title = title;
        t.specURI = specURI;

        emit TaskCreated(id, assignee, msg.value, deadline, title);
    }

    /// @notice Teammate puts proof of work on-chain.
    function submitWork(uint256 id, string calldata workURI, bytes32 workHash) external {
        Task storage t = tasks[id];
        if (msg.sender != t.assignee) revert NotAssignee(); // also covers non-existent ids
        if (t.status != Status.Assigned) revert WrongStatus();
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        if (bytes(workURI).length == 0 || workHash == bytes32(0)) revert EmptyWork();

        t.workURI = workURI;
        t.workHash = workHash;
        t.submittedAt = uint64(block.timestamp);
        t.status = Status.Submitted;

        emit WorkSubmitted(id, msg.sender, workURI, workHash);
    }

    /// @notice Leader approves -> teammate is paid instantly.
    function approveAndPay(uint256 id) external onlyLeader nonReentrant {
        Task storage t = tasks[id];
        if (t.status != Status.Submitted) revert WrongStatus();
        _pay(id, t);
    }

    /// @notice Leader sends work back. Only allowed inside the review window,
    ///         and the deadline is pushed out so the teammate can resubmit.
    function rejectWork(uint256 id, string calldata reason) external onlyLeader {
        Task storage t = tasks[id];
        if (t.status != Status.Submitted) revert WrongStatus();
        if (block.timestamp >= uint256(t.submittedAt) + reviewPeriod) revert ReviewWindowClosed();

        t.status = Status.Assigned;
        uint256 minDeadline = block.timestamp + reviewPeriod;
        if (t.deadline < minDeadline) t.deadline = uint64(minDeadline);

        emit WorkRejected(id, reason, t.deadline);
    }

    /// @notice If the leader ignores a submission, the teammate gets paid anyway.
    function claimAfterReview(uint256 id) external nonReentrant {
        Task storage t = tasks[id];
        if (msg.sender != t.assignee) revert NotAssignee();
        if (t.status != Status.Submitted) revert WrongStatus();
        if (block.timestamp < uint256(t.submittedAt) + reviewPeriod) revert ReviewWindowOpen();
        _pay(id, t);
    }

    /// @notice Leader recovers funds only if nothing was submitted by the deadline.
    function cancelExpired(uint256 id) external onlyLeader nonReentrant {
        Task storage t = tasks[id];
        if (t.status != Status.Assigned) revert WrongStatus();
        if (block.timestamp <= t.deadline) revert DeadlineNotPassed();

        t.status = Status.Cancelled; // effect before interaction
        uint256 amount = t.reward;

        (bool ok, ) = payable(leader).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit TaskCancelled(id, amount);
    }

    // --------------------------------------------------------------- views

    function getTask(uint256 id) external view returns (Task memory) {
        return tasks[id];
    }

    // ------------------------------------------------------------ internal

    function _pay(uint256 id, Task storage t) private {
        t.status = Status.Paid; // effect before interaction
        uint256 amount = t.reward;
        address to = t.assignee;

        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit TaskPaid(id, to, amount);
    }
}
