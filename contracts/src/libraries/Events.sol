// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Events {
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed actor);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed actor);
    event PauseStateSet(bool paused, address indexed actor);
    event RouterWhitelistSet(address indexed router, bool allowed, address indexed actor);
    event RouterSelectorSet(address indexed router, bytes4 indexed selector, bool allowed, address indexed actor);

    event ProposalCreated(bytes32 indexed proposalId, bytes32 indexed proposalHash, uint256 expiry, address indexed actor);
    event ProposalApproved(bytes32 indexed proposalId, address indexed actor);
    event ProposalRejected(bytes32 indexed proposalId, address indexed actor);
    event ProposalMarkedExecuted(bytes32 indexed proposalId, address indexed actor);
    event ProposalMarkedExpired(bytes32 indexed proposalId, address indexed actor);

    event TradeExecuted(
        bytes32 indexed proposalId,
        address indexed router,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 realizedAmountOut,
        address recipient,
        address actor
    );
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount, address indexed actor);
}
