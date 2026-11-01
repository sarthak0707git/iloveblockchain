// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITaskEscrow {
    function submitWork(uint256 id, string calldata workURI, bytes32 workHash) external;
    function claimAfterReview(uint256 id) external;
}

/// @notice Test-only attacker: a team member whose receive() tries to re-enter
///         claimAfterReview while it is being paid.
contract ReentrantMember {
    ITaskEscrow public immutable escrow;

    uint256 public targetId;
    uint256 public timesPaid;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public reentryError;

    constructor(address _escrow) {
        escrow = ITaskEscrow(_escrow);
    }

    function submit(uint256 id, string calldata workURI, bytes32 workHash) external {
        escrow.submitWork(id, workURI, workHash);
    }

    function claim(uint256 id) external {
        targetId = id;
        escrow.claimAfterReview(id);
    }

    receive() external payable {
        timesPaid++;
        if (!reentryAttempted) {
            reentryAttempted = true;
            try escrow.claimAfterReview(targetId) {
                reentrySucceeded = true;
            } catch (bytes memory err) {
                reentryError = err;
            }
        }
    }
}
