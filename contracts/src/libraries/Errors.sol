// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Errors {
    error Unauthorized();
    error Paused();
    error ZeroAddress();
    error RouterNotWhitelisted(address router);
    error SelectorNotAllowed(address router, bytes4 selector);
    error ProposalAlreadyExists(bytes32 proposalId);
    error ProposalNotPending(bytes32 proposalId);
    error ProposalNotLive(bytes32 proposalId, uint8 status);
    error ProposalNotApproved(bytes32 proposalId);
    error ProposalAlreadyExecuted(bytes32 proposalId);
    error ProposalExpired(bytes32 proposalId);
    error ProposalNotExpired(bytes32 proposalId, uint256 expiry);
    error ProposalHashMismatch(bytes32 proposalId);
    error InvalidDeadline(uint256 deadline);
    error DeadlineMismatch(uint256 expected, uint256 actual);
    error InvalidCalldata();
    error InvalidCalldataSelector(bytes4 expected, bytes4 actual);
    error UnsupportedSelector(bytes4 selector);
    error RecipientMismatch(address expected, address actual);
    error TokenInMismatch(address expected, address actual);
    error TokenOutMismatch(address expected, address actual);
    error CalldataSenderMismatch(address expected, address actual);
    error AmountInMismatch(uint256 expected, uint256 actual);
    error MinAmountOutMismatch(uint256 expected, uint256 actual);
    error NativeValueMismatch(uint256 expected, uint256 actual);
    error SpendCapExceeded(uint256 approvedMaxAmountIn, uint256 actualAmountIn);
    error InsufficientOutput(uint256 minAmountOut, uint256 actualAmountOut);
    error TokenApproveFailed(address token, address spender);
    error ExternalCallFailed();
}
