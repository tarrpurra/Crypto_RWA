// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Errors} from "../libraries/Errors.sol";
import {Events} from "../libraries/Events.sol";
import {ExecutionTypes} from "../libraries/ExecutionTypes.sol";
import {ProposalHashLib} from "../libraries/ProposalHashLib.sol";
import {Roles} from "../libraries/Roles.sol";

contract TradeApprovalManager {
    using ProposalHashLib for ExecutionTypes.ExecutionPayload;

    struct ProposalRecord {
        bytes32 proposalHash;
        uint256 expiry;
        ExecutionTypes.ProposalStatus status;
    }

    mapping(bytes32 role => mapping(address account => bool allowed)) private _roles;
    mapping(bytes32 proposalId => ProposalRecord record) private _proposals;

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Errors.Unauthorized();
        _;
    }

    constructor(address admin, address approver) {
        if (admin == address(0) || approver == address(0)) revert Errors.ZeroAddress();
        _roles[Roles.DEFAULT_ADMIN_ROLE][admin] = true;
        _roles[Roles.APPROVER_ROLE][approver] = true;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external onlyRole(Roles.DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert Errors.ZeroAddress();
        _roles[role][account] = true;
        emit Events.RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(Roles.DEFAULT_ADMIN_ROLE) {
        _roles[role][account] = false;
        emit Events.RoleRevoked(role, account, msg.sender);
    }

    function createProposal(ExecutionTypes.ExecutionPayload calldata payload) external onlyRole(Roles.APPROVER_ROLE) {
        ProposalRecord storage existing = _proposals[payload.proposalId];
        if (existing.status != ExecutionTypes.ProposalStatus.NONE) revert Errors.ProposalAlreadyExists(payload.proposalId);
        // forge-lint: disable-next-line(block-timestamp)
        if (payload.proposalExpiry <= block.timestamp) revert Errors.ProposalExpired(payload.proposalId);

        bytes32 proposalHash = payload.proposalHash();
        _proposals[payload.proposalId] = ProposalRecord({
            proposalHash: proposalHash,
            expiry: payload.proposalExpiry,
            status: ExecutionTypes.ProposalStatus.PENDING
        });

        emit Events.ProposalCreated(payload.proposalId, proposalHash, payload.proposalExpiry, msg.sender);
    }

    function approveProposal(bytes32 proposalId) external onlyRole(Roles.APPROVER_ROLE) {
        ProposalRecord storage record = _proposals[proposalId];
        _requirePendingAndLive(proposalId, record);
        record.status = ExecutionTypes.ProposalStatus.APPROVED;
        emit Events.ProposalApproved(proposalId, msg.sender);
    }

    function rejectProposal(bytes32 proposalId) external onlyRole(Roles.APPROVER_ROLE) {
        ProposalRecord storage record = _proposals[proposalId];
        _requirePendingAndLive(proposalId, record);
        record.status = ExecutionTypes.ProposalStatus.REJECTED;
        emit Events.ProposalRejected(proposalId, msg.sender);
    }

    function markExecuted(ExecutionTypes.ExecutionPayload calldata payload) external onlyRole(Roles.EXECUTOR_ROLE) {
        ProposalRecord storage record = _proposals[payload.proposalId];
        if (record.status == ExecutionTypes.ProposalStatus.EXECUTED) revert Errors.ProposalAlreadyExecuted(payload.proposalId);
        if (record.status != ExecutionTypes.ProposalStatus.APPROVED) revert Errors.ProposalNotApproved(payload.proposalId);
        // forge-lint: disable-next-line(block-timestamp)
        if (record.expiry < block.timestamp) revert Errors.ProposalExpired(payload.proposalId);
        if (record.proposalHash != payload.proposalHash()) revert Errors.ProposalHashMismatch(payload.proposalId);

        record.status = ExecutionTypes.ProposalStatus.EXECUTED;
        emit Events.ProposalMarkedExecuted(payload.proposalId, msg.sender);
    }

    function markExpired(bytes32 proposalId) external {
        ProposalRecord storage record = _proposals[proposalId];
        ExecutionTypes.ProposalStatus status = record.status;

        if (status != ExecutionTypes.ProposalStatus.PENDING && status != ExecutionTypes.ProposalStatus.APPROVED) {
            revert Errors.ProposalNotLive(proposalId, uint8(status));
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (record.expiry >= block.timestamp) revert Errors.ProposalNotExpired(proposalId, record.expiry);

        record.status = ExecutionTypes.ProposalStatus.EXPIRED;
        emit Events.ProposalMarkedExpired(proposalId, msg.sender);
    }

    function getProposal(bytes32 proposalId) external view returns (ProposalRecord memory) {
        return _proposals[proposalId];
    }

    function isApprovedAndLive(ExecutionTypes.ExecutionPayload calldata payload) external view returns (bool) {
        ProposalRecord storage record = _proposals[payload.proposalId];
        if (record.status != ExecutionTypes.ProposalStatus.APPROVED) return false;
        // forge-lint: disable-next-line(block-timestamp)
        if (record.expiry < block.timestamp) return false;
        return record.proposalHash == payload.proposalHash();
    }

    function _requirePendingAndLive(bytes32 proposalId, ProposalRecord storage record) internal view {
        if (record.status != ExecutionTypes.ProposalStatus.PENDING) revert Errors.ProposalNotPending(proposalId);
        // forge-lint: disable-next-line(block-timestamp)
        if (record.expiry < block.timestamp) revert Errors.ProposalExpired(proposalId);
    }
}


