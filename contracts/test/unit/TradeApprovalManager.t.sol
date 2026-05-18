// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TradeApprovalManager} from "src/core/TradeApprovalManager.sol";
import {Errors} from "src/libraries/Errors.sol";
import {ExecutionTypes} from "src/libraries/ExecutionTypes.sol";
import {Roles} from "src/libraries/Roles.sol";

contract TradeApprovalManagerTest is Test {
    TradeApprovalManager internal manager;

    address internal admin = address(0xA11CE);
    address internal approver = address(0xB0B);
    address internal executor = address(0xE0);

    function setUp() public {
        vm.prank(admin);
        manager = new TradeApprovalManager(admin, approver);

        vm.prank(admin);
        manager.grantRole(Roles.EXECUTOR_ROLE, executor);
    }

    function testCreateApproveAndExecute() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P1"));

        vm.prank(approver);
        manager.createProposal(payload);

        vm.prank(approver);
        manager.approveProposal(payload.proposalId);

        vm.prank(executor);
        manager.markExecuted(payload);

        TradeApprovalManager.ProposalRecord memory proposal = manager.getProposal(payload.proposalId);
        assertEq(uint256(proposal.status), uint256(ExecutionTypes.ProposalStatus.EXECUTED));
    }

    function testRejectFlow() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P2"));

        vm.prank(approver);
        manager.createProposal(payload);

        vm.prank(approver);
        manager.rejectProposal(payload.proposalId);

        TradeApprovalManager.ProposalRecord memory proposal = manager.getProposal(payload.proposalId);
        assertEq(uint256(proposal.status), uint256(ExecutionTypes.ProposalStatus.REJECTED));
    }

    function testExpiredProposalCannotBeApproved() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P3"));

        vm.prank(approver);
        manager.createProposal(payload);

        vm.warp(block.timestamp + 2 days);

        vm.prank(approver);
        vm.expectRevert(abi.encodeWithSelector(Errors.ProposalExpired.selector, payload.proposalId));
        manager.approveProposal(payload.proposalId);
    }

    function testModifiedPayloadCannotExecute() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P4"));

        vm.startPrank(approver);
        manager.createProposal(payload);
        manager.approveProposal(payload.proposalId);
        vm.stopPrank();

        payload.minAmountOut = payload.minAmountOut + 1;

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.ProposalHashMismatch.selector, payload.proposalId));
        manager.markExecuted(payload);
    }

    function testReplayExecutionReverts() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P5"));

        vm.startPrank(approver);
        manager.createProposal(payload);
        manager.approveProposal(payload.proposalId);
        vm.stopPrank();

        vm.prank(executor);
        manager.markExecuted(payload);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.ProposalAlreadyExecuted.selector, payload.proposalId));
        manager.markExecuted(payload);
    }

    function testApprovedProposalCanBeMarkedExpired() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P6"));

        vm.startPrank(approver);
        manager.createProposal(payload);
        manager.approveProposal(payload.proposalId);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        manager.markExpired(payload.proposalId);

        TradeApprovalManager.ProposalRecord memory proposal = manager.getProposal(payload.proposalId);
        assertEq(uint256(proposal.status), uint256(ExecutionTypes.ProposalStatus.EXPIRED));
    }

    function testRejectedProposalCannotBeMarkedExpired() public {
        ExecutionTypes.ExecutionPayload memory payload = _payload(bytes32("P7"));

        vm.startPrank(approver);
        manager.createProposal(payload);
        manager.rejectProposal(payload.proposalId);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.ProposalNotLive.selector,
                payload.proposalId,
                uint8(ExecutionTypes.ProposalStatus.REJECTED)
            )
        );
        manager.markExpired(payload.proposalId);
    }

    function _payload(bytes32 proposalId) internal view returns (ExecutionTypes.ExecutionPayload memory payload) {
        payload.proposalId = proposalId;
        payload.planHash = keccak256("plan");
        payload.router = address(0x1111);
        payload.selector = bytes4(keccak256("swap()"));
        payload.calldataHash = keccak256("calldata");
        payload.tokenIn = address(0x2222);
        payload.tokenOut = address(0x3333);
        payload.recipient = address(0x4444);
        payload.maxAmountIn = 1e18;
        payload.minAmountOut = 9e17;
        payload.nativeValue = 0;
        payload.deadline = block.timestamp + 1 days;
        payload.proposalExpiry = block.timestamp + 1 days;
        payload.nonce = 1;
    }
}
