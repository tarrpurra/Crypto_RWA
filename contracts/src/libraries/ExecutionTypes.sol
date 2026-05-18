// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ExecutionTypes {
    enum ProposalStatus {
        NONE,
        PENDING,
        APPROVED,
        REJECTED,
        EXECUTED,
        EXPIRED
    }

    struct ExecutionPayload {
        bytes32 proposalId;
        bytes32 planHash;
        address router;
        bytes4 selector;
        bytes32 calldataHash;
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 maxAmountIn;
        uint256 minAmountOut;
        uint256 nativeValue;
        uint256 deadline;
        uint256 proposalExpiry;
        uint256 nonce;
    }
}
